import type { ProfilePoint } from './types';

/**
 * Rate of consumption of A: -r_A = k * C_A^n
 * C_A in terms of conversion X (constant-density assumption):
 *   C_A = C_A0 * (1 - X)
 */
export function rateOfReaction(k: number, C_A0: number, X: number, order: number): number {
  const C_A = C_A0 * (1 - X);
  if (C_A < 0) return 0;
  return k * Math.pow(C_A, order);
}

/**
 * Levenspiel integrand: F_A0 / (-r_A)
 * This is dV/dX for the PFR design equation.
 */
export function levenspielIntegrand(F_A0: number, k: number, C_A0: number, X: number, order: number): number {
  const r = rateOfReaction(k, C_A0, X, order);
  if (r <= 0) return Infinity;
  return F_A0 / r;
}

/**
 * Adaptive Simpson's rule integration of f from a to b.
 * Falls back to composite Simpson's with N=1000 steps for robustness.
 */
export function integrate(f: (x: number) => number, a: number, b: number, steps = 1000): number {
  const h = (b - a) / steps;
  let sum = f(a) + f(b);
  for (let i = 1; i < steps; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
  }
  return (h / 3) * sum;
}

/**
 * Bisection root-finding for solving g(x) = 0 on [lo, hi].
 */
export function bisect(g: (x: number) => number, lo: number, hi: number, tol = 1e-9, maxIter = 200): number {
  let gLo = g(lo);
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const gMid = g(mid);
    if (Math.abs(gMid) < tol || (hi - lo) / 2 < tol) return mid;
    if (Math.sign(gMid) === Math.sign(gLo)) {
      lo = mid;
      gLo = gMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Generate a conversion profile (volume vs conversion) for plotting.
 */
export function buildProfile(
  computeX: (v: number) => number,
  V_total: number,
  points = 50
): ProfilePoint[] {
  const profile: ProfilePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const v = (V_total * i) / points;
    const x = Math.max(0, Math.min(1, computeX(v)));
    profile.push({ volume: v, conversion: x });
  }
  return profile;
}
