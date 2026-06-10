import { rateOfReaction, bisect } from './utils';
import type { SizingInput, ConversionInput, SizingResult, ConversionResult } from './types';

/**
 * CSTR design equation: V = F_A0 * X / (-r_A evaluated at exit)
 *
 * For n-th order reaction with constant density:
 *   V = F_A0 * X / (k * C_A0^n * (1 - X)^n)
 */
export function sizeCSTR(input: SizingInput): SizingResult {
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

  const r_exit = rateOfReaction(k, C_A0, X_target, order);
  if (r_exit <= 0) {
    return { ok: false, validConversion, positiveVolume: false, V: NaN,
      error: 'Rate at exit is zero — check inputs.' };
  }

  const V = (F_A0 * X_target) / r_exit;
  const positiveVolume = V > 0;

  return { ok: positiveVolume && validConversion, validConversion, positiveVolume, V };
}

/**
 * Solve for conversion in a CSTR of given volume V.
 *
 * CSTR mole balance rearranged:
 *   F_A0 * X = V * k * C_A0^n * (1 - X)^n
 * Solve: g(X) = F_A0 * X - V * k * C_A0^n * (1 - X)^n = 0
 */
export function conversionInCSTR(input: ConversionInput): ConversionResult {
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

  // For first-order: analytical solution X = k*tau / (1 + k*tau), tau = C_A0*V/F_A0
  if (order === 1) {
    const tau = (C_A0 * V) / F_A0;
    const X = (k * tau) / (1 + k * tau);
    const validConversion = X >= 0 && X <= 1;
    return { ok: validConversion && positiveVolume, validConversion, positiveVolume, X };
  }

  // For n-th order: solve numerically via bisection
  const g = (X: number) => F_A0 * X - V * rateOfReaction(k, C_A0, X, order);

  // g(0) = 0, g(1-eps) < 0 typically; find bracket
  const eps = 1e-9;
  if (Math.sign(g(eps)) === Math.sign(g(1 - eps))) {
    return { ok: false, validConversion: false, positiveVolume, X: NaN,
      error: 'Could not bracket solution — check inputs.' };
  }

  const X = bisect(g, eps, 1 - eps);
  const validConversion = X >= 0 && X <= 1;
  return { ok: validConversion && positiveVolume, validConversion, positiveVolume, X };
}
