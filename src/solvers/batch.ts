/**
 * Batch Reactor (BR) Solver
 *
 * Design equation (constant volume, variable composition):
 *
 *   N_A0 · dX/dt = -r_A · V
 *
 * For constant-density liquid phase (C_A = C_A0·(1-X)):
 *
 *   t = C_A0 · ∫₀^X  dX / (-r_A)
 *
 * where  -r_A = k · C_A0ⁿ · (1 - X)ⁿ
 *
 * So the integrand simplifies to:
 *
 *   t = (1 / k·C_A0^(n-1)) · ∫₀^X  dX / (1 - X)ⁿ
 *
 * Analytical solutions:
 *   n = 1: t = -ln(1 - X) / k
 *   n ≠ 1: t = [1 - (1-X)^(1-n)] / [k · C_A0^(n-1) · (1 - n)]
 */

import { integrate, bisect } from './utils';
import type {
  BatchSizingInput,
  BatchConversionInput,
  BatchSizingResult,
  BatchConversionResult,
  BatchProfilePoint,
} from './types';

// Integrand: dX / (-r_A / C_A0) = dX / [k · C_A0^(n-1) · (1-X)^n]
function batchIntegrand(k: number, C_A0: number, X: number, order: number): number {
  const base = 1 - X;
  if (base <= 0) return Infinity;
  return 1 / (k * Math.pow(C_A0, order - 1) * Math.pow(base, order));
}

function analyticalTime(k: number, C_A0: number, X: number, order: number): number {
  if (order === 1) return -Math.log(1 - X) / k;
  return (1 - Math.pow(1 - X, 1 - order)) / (k * Math.pow(C_A0, order - 1) * (1 - order));
}

function analyticalConversion(k: number, C_A0: number, t: number, order: number): number {
  if (order === 1) return 1 - Math.exp(-k * t);
  const inner = 1 - (1 - order) * k * Math.pow(C_A0, order - 1) * t;
  if (inner <= 0) return 1; // full conversion
  return 1 - Math.pow(inner, 1 / (1 - order));
}

function buildBatchProfile(
  k: number, C_A0: number, t_total: number, order: number, points = 50
): BatchProfilePoint[] {
  const profile: BatchProfilePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (t_total * i) / points;
    let X: number;
    if (Number.isInteger(order) || order === Math.floor(order)) {
      X = analyticalConversion(k, C_A0, t, order);
    } else {
      // Numerical: solve ∫₀^X integrand dX = t
      const g = (x: number) => integrate((xx) => batchIntegrand(k, C_A0, xx, order), 0, x) - t;
      X = t <= 0 ? 0 : bisect(g, 1e-9, 1 - 1e-9);
    }
    profile.push({ time: t, conversion: Math.max(0, Math.min(1, X)) });
  }
  return profile;
}

export function sizeBatch(input: BatchSizingInput): BatchSizingResult {
  const { C_A0, k, X_target, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, t: NaN, profile: [],
      error: 'X_target must be strictly between 0 and 1.' };
  }
  if (C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, t: NaN, profile: [],
      error: 'C_A0 and k must be positive.' };
  }

  const t = analyticalTime(k, C_A0, X_target, order);

  if (!isFinite(t) || isNaN(t) || t < 0) {
    return { ok: false, validConversion, t: NaN, profile: [],
      error: 'Could not compute reaction time — check inputs.' };
  }

  const profile = buildBatchProfile(k, C_A0, t, order);
  return { ok: true, validConversion, t, profile };
}

export function conversionInBatch(input: BatchConversionInput): BatchConversionResult {
  const { C_A0, k, t, order = 1 } = input;

  if (t <= 0) {
    return { ok: false, validConversion: false, X: 0, profile: [],
      error: 't must be positive.' };
  }
  if (C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, X: NaN, profile: [],
      error: 'C_A0 and k must be positive.' };
  }

  const X = analyticalConversion(k, C_A0, t, order);
  const validConversion = X >= 0 && X <= 1;
  const profile = buildBatchProfile(k, C_A0, t, order);

  return { ok: validConversion, validConversion, X: Math.max(0, Math.min(1, X)), profile };
}
