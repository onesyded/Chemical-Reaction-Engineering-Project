/**
 * CSTRs in Series Solver
 *
 * Design equation for the i-th CSTR in a series of N equal-volume reactors:
 *
 *   F_A0 · (X_i - X_{i-1}) = V_i · (-r_A(X_i))
 *
 * where  -r_A(X_i) = k · C_A0^n · (1 - X_i)^n   (constant density)
 *
 * Rearranged for sizing (find X_i given V and X_{i-1}):
 *
 *   k · C_A0^n · (1 - X_i)^n · V = F_A0 · (X_i - X_{i-1})
 *   g(X_i) = F_A0·(X_i - X_{i-1}) - V·k·C_A0^n·(1-X_i)^n = 0
 *
 * First-order analytical per stage: X_i = 1 - (1 - X_{i-1}) / (1 + k·τ)
 * where τ = C_A0·V / F_A0
 *
 * Sizing: find V_each (bisection) such that after N stages X_N ≥ X_target.
 */

import { bisect } from './utils';
import type {
  CSTRSeriesSizingInput,
  CSTRSeriesConversionInput,
  CSTRSeriesSizingResult,
  CSTRSeriesConversionResult,
} from './types';

function solveOneStage(
  F_A0: number, C_A0: number, k: number, V: number, X_in: number, order: number
): number {
  if (order === 1) {
    const tau = (C_A0 * V) / F_A0;
    return 1 - (1 - X_in) / (1 + k * tau);
  }

  // n-th order: solve g(X_i) = 0 via bisection
  const g = (X: number) =>
    F_A0 * (X - X_in) - V * k * Math.pow(C_A0, order) * Math.pow(1 - X, order);

  const eps = 1e-9;
  const hi = 1 - eps;

  // If g at hi is negative, the stage can achieve near-complete conversion
  if (g(hi) <= 0) return hi;
  if (g(X_in + eps) >= 0) return X_in; // no reaction possible

  return bisect(g, X_in + eps, hi);
}

function simulateSeries(
  F_A0: number, C_A0: number, k: number, V_each: number, N: number, order: number
): number[] {
  const stages: number[] = [];
  let X = 0;
  for (let i = 0; i < N; i++) {
    X = solveOneStage(F_A0, C_A0, k, V_each, X, order);
    stages.push(Math.max(0, Math.min(1, X)));
  }
  return stages;
}

export function sizeCSTRSeries(input: CSTRSeriesSizingInput): CSTRSeriesSizingResult {
  const { F_A0, C_A0, k, X_target, N, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, V_each: NaN, V_total: NaN,
      stage_conversions: [], error: 'X_target must be strictly between 0 and 1.' };
  }
  if (!Number.isInteger(N) || N < 1) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], error: 'N must be a positive integer.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], error: 'F_A0, C_A0, and k must be positive.' };
  }

  // Bisect on V_each: find value where final stage conversion == X_target
  const finalX = (V: number) => simulateSeries(F_A0, C_A0, k, V, N, order).at(-1)!;

  // Upper bound: a very large volume should give X > X_target
  let V_hi = 1e6;
  if (finalX(V_hi) < X_target) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], error: 'Cannot reach X_target with given parameters.' };
  }

  const V_each = bisect((V) => finalX(V) - X_target, 1e-12, V_hi);
  const stage_conversions = simulateSeries(F_A0, C_A0, k, V_each, N, order);

  return {
    ok: true,
    validConversion,
    V_each,
    V_total: V_each * N,
    stage_conversions,
  };
}

export function conversionInCSTRSeries(input: CSTRSeriesConversionInput): CSTRSeriesConversionResult {
  const { F_A0, C_A0, k, V_each, N, order = 1 } = input;

  if (V_each <= 0) {
    return { ok: false, validConversion: false, X: NaN, stage_conversions: [],
      error: 'V_each must be positive.' };
  }
  if (!Number.isInteger(N) || N < 1) {
    return { ok: false, validConversion: false, X: NaN, stage_conversions: [],
      error: 'N must be a positive integer.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, X: NaN, stage_conversions: [],
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  const stage_conversions = simulateSeries(F_A0, C_A0, k, V_each, N, order);
  const X = stage_conversions.at(-1)!;
  const validConversion = X >= 0 && X <= 1;

  return { ok: validConversion, validConversion, X, stage_conversions };
}
