import { levenspielIntegrand, integrate, bisect, buildProfile } from './utils';
import type { SizingInput, ConversionInput, SizingResult, ConversionResult } from './types';

/**
 * PFR design equation: V = F_A0 * ∫₀^X dX / (-r_A)
 *
 * Solved by numerical integration (composite Simpson's rule).
 * Works for any reaction order — no analytical assumption made.
 */
export function sizePFR(input: SizingInput): SizingResult {
  const { F_A0, C_A0, k, X_target, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, positiveVolume: false, V: NaN,
      error: 'X_target must be strictly between 0 and 1.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, positiveVolume: false, V: NaN,
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  // Integrate the Levenspiel integrand from X=0 to X=X_target
  // Near X=0 the integrand is well-behaved; avoid X=1 singularity for n≥1
  const f = (X: number) => levenspielIntegrand(F_A0, k, C_A0, X, order);
  const V = integrate(f, 0, X_target);

  if (!isFinite(V) || isNaN(V)) {
    return { ok: false, validConversion, positiveVolume: false, V: NaN,
      error: 'Integration failed — check inputs (e.g. X_target too close to 1).' };
  }

  const positiveVolume = V > 0;

  // Build profile: for each sub-volume v, solve ∫₀^X = v/F_A0 numerically
  const profile = buildProfile((v) => _pfrConversionAtVolume(F_A0, C_A0, k, order, v), V);

  return { ok: positiveVolume && validConversion, validConversion, positiveVolume, V, profile };
}

/**
 * Calculate conversion achieved in a PFR of given volume V.
 * Solves: ∫₀^X dX/(-r_A) = V/F_A0
 */
export function conversionInPFR(input: ConversionInput): ConversionResult {
  const { F_A0, C_A0, k, V, order = 1 } = input;

  const positiveVolume = V > 0;
  if (!positiveVolume) {
    return { ok: false, validConversion: false, positiveVolume: false, X: NaN,
      error: 'V must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, positiveVolume, X: NaN,
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  const X = _pfrConversionAtVolume(F_A0, C_A0, k, order, V);

  if (isNaN(X)) {
    return { ok: false, validConversion: false, positiveVolume, X: NaN,
      error: 'Could not solve for conversion — check inputs.' };
  }

  const validConversion = X >= 0 && X <= 1;
  const profile = buildProfile((v) => _pfrConversionAtVolume(F_A0, C_A0, k, order, v), V);

  return { ok: validConversion && positiveVolume, validConversion, positiveVolume, X, profile };
}

/**
 * Internal: find conversion X such that ∫₀^X dX/(-r_A) = V/F_A0.
 * Uses bisection on the CDF of the Levenspiel integrand.
 */
function _pfrConversionAtVolume(
  F_A0: number, C_A0: number, k: number, order: number, V: number
): number {
  if (V <= 0) return 0;

  // For first-order, use exact analytical solution: X = 1 - exp(-k*C_A0*V/F_A0)
  if (order === 1) {
    return 1 - Math.exp(-(k * C_A0 * V) / F_A0);
  }

  const target = V / F_A0;
  const f = (X: number) => levenspielIntegrand(F_A0, k, C_A0, X, order);

  // g(X) = ∫₀^X dX/(-r_A) - target
  const g = (X: number) => integrate(f, 0, X) - target;

  const eps = 1e-9;
  const hiGuess = 1 - eps;

  // If g(hiGuess) < 0, the volume gives conversion > hiGuess — clamp
  if (g(hiGuess) < 0) return hiGuess;
  if (g(eps) > 0) return 0;

  return bisect(g, eps, hiGuess);
}
