/**
 * CSTRs of Unequal Volumes in Series Solver
 *
 * A train of N CSTRs where each reactor may have a different volume.
 * The outlet of reactor i becomes the inlet of reactor i+1.
 *
 * Design equation for stage i (inlet X_{i-1}, outlet X_i, volume V_i):
 *
 *   V_i · (-r_A(X_i)) = F_A0 · (X_i - X_{i-1})
 *
 * where  -r_A(X_i) = k · C_A0^n · (1 - X_i)^n   (constant density)
 *
 * Sizing: the user supplies relative volume fractions [f_1, f_2, ..., f_N]
 * (auto-normalised so they sum to 1). The solver uses bisection on V_total
 * to find the total volume that achieves X_target, then scales each reactor:
 *   V_i = f_i · V_total
 */

import { cstrExitConversion, bisect } from './utils';
import type {
  CSTRUnequalSizingInput,
  CSTRUnequalConversionInput,
  CSTRUnequalSizingResult,
  CSTRUnequalConversionResult,
} from './types';

function simulateUnequal(
  F_A0: number, C_A0: number, k: number, order: number, volumes: number[]
): number[] {
  const stage_conversions: number[] = [];
  let X = 0;
  for (const V of volumes) {
    X = Math.max(0, Math.min(1, cstrExitConversion(F_A0, C_A0, k, order, X, V)));
    stage_conversions.push(X);
  }
  return stage_conversions;
}

export function sizeCSTRUnequal(input: CSTRUnequalSizingInput): CSTRUnequalSizingResult {
  const { F_A0, C_A0, k, X_target, volume_fractions, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, volumes: [], V_total: NaN,
      stage_conversions: [], error: 'X_target must be strictly between 0 and 1.' };
  }
  if (!volume_fractions || volume_fractions.length === 0) {
    return { ok: false, validConversion, volumes: [], V_total: NaN,
      stage_conversions: [], error: 'volume_fractions must not be empty.' };
  }
  if (volume_fractions.some(f => f <= 0)) {
    return { ok: false, validConversion, volumes: [], V_total: NaN,
      stage_conversions: [], error: 'All volume fractions must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, volumes: [], V_total: NaN,
      stage_conversions: [], error: 'F_A0, C_A0, and k must be positive.' };
  }

  // Normalise fractions so they sum to 1
  const total_frac = volume_fractions.reduce((a, b) => a + b, 0);
  const fracs = volume_fractions.map(f => f / total_frac);

  const finalX = (V_total: number) => {
    const vols = fracs.map(f => f * V_total);
    return simulateUnequal(F_A0, C_A0, k, order, vols).at(-1)!;
  };

  // Upper bound search
  let V_hi = 1e6;
  if (finalX(V_hi) < X_target) {
    return { ok: false, validConversion, volumes: [], V_total: NaN,
      stage_conversions: [], error: 'Cannot reach X_target with given parameters.' };
  }

  const V_total = bisect((V) => finalX(V) - X_target, 1e-12, V_hi);
  const volumes = fracs.map(f => f * V_total);
  const stage_conversions = simulateUnequal(F_A0, C_A0, k, order, volumes);

  return { ok: true, validConversion, volumes, V_total, stage_conversions };
}

export function conversionInCSTRUnequal(input: CSTRUnequalConversionInput): CSTRUnequalConversionResult {
  const { F_A0, C_A0, k, volumes, order = 1 } = input;

  if (!volumes || volumes.length === 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], error: 'volumes array must not be empty.' };
  }
  if (volumes.some(v => v <= 0)) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], error: 'All volumes must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], error: 'F_A0, C_A0, and k must be positive.' };
  }

  const stage_conversions = simulateUnequal(F_A0, C_A0, k, order, volumes);
  const X = stage_conversions.at(-1)!;
  const validConversion = X >= 0 && X <= 1;

  return { ok: validConversion, validConversion, X, stage_conversions };
}
