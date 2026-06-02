/**
 * Packed Bed Reactor (PBR) Solver
 *
 * Design equation (Ergun / mole balance on catalyst weight):
 *
 *   F_A0 · dX/dW = -r'_A
 *
 * where -r'_A is the rate of disappearance of A per unit weight of catalyst
 * (mol · kg_cat⁻¹ · s⁻¹).
 *
 * For a power-law rate with constant density:
 *
 *   -r'_A = k' · C_A^n = k' · C_A0^n · (1 - X)^n
 *
 * Integrating:
 *
 *   W = F_A0 · ∫₀^X  dX / (-r'_A)
 *     = (F_A0 / k'·C_A0^n) · ∫₀^X  dX / (1 - X)^n
 *
 * Structurally identical to the PFR equation (V → W, k → k').
 * First-order analytical: W = -(F_A0 / k'·C_A0) · ln(1 - X)
 */

import { integrate, bisect, buildProfile } from './utils';
import type {
  PBRSizingInput,
  PBRConversionInput,
  PBRSizingResult,
  PBRConversionResult,
  PBRProfilePoint,
} from './types';

function pbrIntegrand(F_A0: number, k_prime: number, C_A0: number, X: number, order: number): number {
  const base = 1 - X;
  if (base <= 0) return Infinity;
  return F_A0 / (k_prime * Math.pow(C_A0, order) * Math.pow(base, order));
}

function pbrConversionAtWeight(
  F_A0: number, C_A0: number, k_prime: number, order: number, W: number
): number {
  if (W <= 0) return 0;

  if (order === 1) {
    return 1 - Math.exp(-(k_prime * C_A0 * W) / F_A0);
  }

  const target = W / F_A0;
  const f = (X: number) => 1 / (k_prime * Math.pow(C_A0, order) * Math.pow(1 - X, order));
  const g = (X: number) => integrate(f, 0, X) - target;

  const eps = 1e-9;
  if (g(1 - eps) < 0) return 1 - eps;
  if (g(eps) > 0) return 0;
  return bisect(g, eps, 1 - eps);
}

function buildPBRProfile(
  F_A0: number, C_A0: number, k_prime: number, order: number, W_total: number, points = 50
): PBRProfilePoint[] {
  const profile: PBRProfilePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const w = (W_total * i) / points;
    const X = Math.max(0, Math.min(1, pbrConversionAtWeight(F_A0, C_A0, k_prime, order, w)));
    profile.push({ weight: w, conversion: X });
  }
  return profile;
}

export function sizePBR(input: PBRSizingInput): PBRSizingResult {
  const { F_A0, C_A0, k_prime, X_target, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, W: NaN, profile: [],
      error: 'X_target must be strictly between 0 and 1.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k_prime <= 0) {
    return { ok: false, validConversion, W: NaN, profile: [],
      error: 'F_A0, C_A0, and k_prime must be positive.' };
  }

  const f = (X: number) => pbrIntegrand(F_A0, k_prime, C_A0, X, order);
  const W = integrate(f, 0, X_target);

  if (!isFinite(W) || isNaN(W) || W <= 0) {
    return { ok: false, validConversion, W: NaN, profile: [],
      error: 'Integration failed — check inputs.' };
  }

  const profile = buildPBRProfile(F_A0, C_A0, k_prime, order, W);
  return { ok: true, validConversion, W, profile };
}

export function conversionInPBR(input: PBRConversionInput): PBRConversionResult {
  const { F_A0, C_A0, k_prime, W, order = 1 } = input;

  if (W <= 0) {
    return { ok: false, validConversion: false, X: NaN, profile: [],
      error: 'W must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k_prime <= 0) {
    return { ok: false, validConversion: false, X: NaN, profile: [],
      error: 'F_A0, C_A0, and k_prime must be positive.' };
  }

  const X = pbrConversionAtWeight(F_A0, C_A0, k_prime, order, W);
  const validConversion = X >= 0 && X <= 1;
  const profile = buildPBRProfile(F_A0, C_A0, k_prime, order, W);

  return { ok: validConversion, validConversion, X, profile };
}
