/**
 * PFRs in Series Solver
 *
 * A train of N PFRs connected end-to-end. The outlet of reactor i becomes
 * the inlet of reactor i+1.
 *
 * Design equation for segment i (inlet X_{i-1}, outlet X_i, volume V_i):
 *
 *   V_i = F_A0 · ∫_{X_{i-1}}^{X_i}  dX / (-r_A(X))
 *
 * Key property: PFRs in series are equivalent to one large PFR of the same
 * total volume. This solver exploits that fact for sizing (split the total
 * volume equally), while still tracking per-reactor profiles.
 */

import { pfrExitConversion, levenspielIntegrand, integrate, bisect } from './utils';
import type {
  PFRSeriesSizingInput,
  PFRSeriesConversionInput,
  PFRSeriesSizingResult,
  PFRSeriesConversionResult,
  ProfilePoint,
} from './types';

function buildSegmentProfile(
  F_A0: number, C_A0: number, k: number, order: number,
  X_in: number, V: number, points = 40
): ProfilePoint[] {
  const profile: ProfilePoint[] = [];
  for (let i = 0; i <= points; i++) {
    const v = (V * i) / points;
    const X = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, X_in, v)));
    profile.push({ volume: v, conversion: X });
  }
  return profile;
}

export function sizePFRSeries(input: PFRSeriesSizingInput): PFRSeriesSizingResult {
  const { F_A0, C_A0, k, X_target, N, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, V_each: NaN, V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'X_target must be strictly between 0 and 1.' };
  }
  if (!Number.isInteger(N) || N < 1) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'N must be a positive integer.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  // Total volume = PFR integral from 0 to X_target
  const f = (X: number) => levenspielIntegrand(F_A0, k, C_A0, X, order);
  const V_total = integrate(f, 0, X_target);

  if (!isFinite(V_total) || V_total <= 0) {
    return { ok: false, validConversion, V_each: NaN, V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'Integration failed — check inputs.' };
  }

  const V_each = V_total / N;
  const stage_conversions: number[] = [];
  const stage_profiles: ProfilePoint[][] = [];

  let X_in = 0;
  for (let i = 0; i < N; i++) {
    const X_out = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, X_in, V_each)));
    stage_conversions.push(X_out);
    stage_profiles.push(buildSegmentProfile(F_A0, C_A0, k, order, X_in, V_each));
    X_in = X_out;
  }

  return { ok: true, validConversion, V_each, V_total, stage_conversions, stage_profiles };
}

export function conversionInPFRSeries(input: PFRSeriesConversionInput): PFRSeriesConversionResult {
  const { F_A0, C_A0, k, volumes, order = 1 } = input;

  if (!volumes || volumes.length === 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'volumes array must not be empty.' };
  }
  if (volumes.some(v => v <= 0)) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'All volumes must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  const stage_conversions: number[] = [];
  const stage_profiles: ProfilePoint[][] = [];

  let X_in = 0;
  for (const V of volumes) {
    const X_out = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, X_in, V)));
    stage_conversions.push(X_out);
    stage_profiles.push(buildSegmentProfile(F_A0, C_A0, k, order, X_in, V));
    X_in = X_out;
  }

  const X = stage_conversions.at(-1)!;
  const validConversion = X >= 0 && X <= 1;
  return { ok: validConversion, validConversion, X, stage_conversions, stage_profiles };
}
