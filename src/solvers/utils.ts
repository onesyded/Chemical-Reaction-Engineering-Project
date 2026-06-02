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

/**
 * Exit conversion from a PFR segment of volume V, given inlet conversion X_in.
 *
 * Solves: ∫_{X_in}^{X_out} dX / (-r_A) = V / F_A0
 *
 * First-order analytical: X_out = 1 - (1 - X_in) · exp(-k·C_A0·V / F_A0)
 */
export function pfrExitConversion(
  F_A0: number, C_A0: number, k: number, order: number, X_in: number, V: number
): number {
  if (V <= 0) return X_in;
  const eps = 1e-9;
  const hi = 1 - eps;

  if (order === 1) {
    return 1 - (1 - X_in) * Math.exp(-(k * C_A0 * V) / F_A0);
  }

  const target = V / F_A0;
  const f = (X: number) => levenspielIntegrand(F_A0, k, C_A0, X, order);
  const g = (X_out: number) => integrate(f, X_in, X_out) - target;

  if (X_in >= hi) return hi;
  if (g(hi) <= 0) return hi;
  if (g(X_in + eps) >= 0) return X_in;

  return bisect(g, X_in + eps, hi);
}

/**
 * Exit conversion from a CSTR of volume V, given inlet conversion X_in.
 *
 * Solves: V · (-r_A(X_out)) = F_A0 · (X_out - X_in)
 * i.e.: g(X_out) = F_A0·(X_out - X_in) - V·k·C_A0^n·(1-X_out)^n = 0
 *
 * First-order analytical: X_out = 1 - (1 - X_in) / (1 + k·τ)  where τ = C_A0·V/F_A0
 */
export function cstrExitConversion(
  F_A0: number, C_A0: number, k: number, order: number, X_in: number, V: number
): number {
  if (V <= 0) return X_in;
  const eps = 1e-9;

  if (order === 1) {
    const tau = (C_A0 * V) / F_A0;
    return 1 - (1 - X_in) / (1 + k * tau);
  }

  const g = (X: number) =>
    F_A0 * (X - X_in) - V * k * Math.pow(C_A0, order) * Math.pow(1 - X, order);

  const hi = 1 - eps;
  if (g(hi) <= 0) return hi;
  if (g(X_in + eps) >= 0) return X_in;

  return bisect(g, X_in + eps, hi);
}
