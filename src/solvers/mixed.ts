/**
 * Mixed CSTR + PFR Reactor Network Solver
 *
 * An ordered sequence of CSTRs and PFRs connected in series.
 * Each unit can be independently a CSTR or a PFR.
 *
 * Design equations:
 *
 *   PFR segment i:  V_i = F_A0 · ∫_{X_{i-1}}^{X_i}  dX / (-r_A(X))
 *   CSTR segment i: V_i · (-r_A(X_i)) = F_A0 · (X_i - X_{i-1})
 *
 * Sizing: the user provides an ordered configuration of reactor types and
 * their relative volume fractions. The solver bisects on V_total to find
 * the total volume achieving X_target, then assigns V_i = frac_i · V_total.
 *
 * Conversion: given a sequence of { type, volume } units, the solver
 * propagates conversion through the train stage by stage.
 *
 * CSTR stages return null profiles (well-mixed, no spatial gradient).
 * PFR stages return a spatial conversion profile for plotting.
 */

import { pfrExitConversion, cstrExitConversion, bisect } from './utils';
import type {
  MixedSizingInput,
  MixedConversionInput,
  MixedSizingResult,
  MixedConversionResult,
  ReactorUnit,
  ProfilePoint,
} from './types';

function buildPFRSegmentProfile(
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

function simulateMixed(
  F_A0: number, C_A0: number, k: number, order: number, reactors: ReactorUnit[]
): { stage_conversions: number[]; stage_profiles: Array<ProfilePoint[] | null> } {
  const stage_conversions: number[] = [];
  const stage_profiles: Array<ProfilePoint[] | null> = [];
  let X = 0;

  for (const reactor of reactors) {
    const { type, volume: V } = reactor;

    if (type === 'PFR') {
      const X_out = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, X, V)));
      stage_conversions.push(X_out);
      stage_profiles.push(buildPFRSegmentProfile(F_A0, C_A0, k, order, X, V));
      X = X_out;
    } else {
      const X_out = Math.max(0, Math.min(1, cstrExitConversion(F_A0, C_A0, k, order, X, V)));
      stage_conversions.push(X_out);
      stage_profiles.push(null); // CSTR: no spatial profile
      X = X_out;
    }
  }

  return { stage_conversions, stage_profiles };
}

export function sizeMixedReactors(input: MixedSizingInput): MixedSizingResult {
  const { F_A0, C_A0, k, X_target, configuration, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, reactors: [], V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'X_target must be strictly between 0 and 1.' };
  }
  if (!configuration || configuration.length === 0) {
    return { ok: false, validConversion, reactors: [], V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'configuration must not be empty.' };
  }
  if (configuration.some(u => u.volume_fraction <= 0)) {
    return { ok: false, validConversion, reactors: [], V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'All volume_fractions must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion, reactors: [], V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  // Normalise fractions
  const total_frac = configuration.reduce((s, u) => s + u.volume_fraction, 0);
  const fracs = configuration.map(u => u.volume_fraction / total_frac);

  const simulate = (V_total: number) => {
    const reactors: ReactorUnit[] = configuration.map((u, i) => ({
      type: u.type,
      volume: fracs[i] * V_total,
    }));
    return simulateMixed(F_A0, C_A0, k, order, reactors).stage_conversions.at(-1)!;
  };

  let V_hi = 1e6;
  if (simulate(V_hi) < X_target) {
    return { ok: false, validConversion, reactors: [], V_total: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'Cannot reach X_target with the given configuration.' };
  }

  const V_total = bisect((V) => simulate(V) - X_target, 1e-12, V_hi);
  const reactors: ReactorUnit[] = configuration.map((u, i) => ({
    type: u.type,
    volume: fracs[i] * V_total,
  }));

  const { stage_conversions, stage_profiles } = simulateMixed(F_A0, C_A0, k, order, reactors);

  return { ok: true, validConversion, reactors, V_total, stage_conversions, stage_profiles };
}

export function conversionInMixedReactors(input: MixedConversionInput): MixedConversionResult {
  const { F_A0, C_A0, k, reactors, order = 1 } = input;

  if (!reactors || reactors.length === 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'reactors array must not be empty.' };
  }
  if (reactors.some(r => r.volume <= 0)) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'All reactor volumes must be positive.' };
  }
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) {
    return { ok: false, validConversion: false, X: NaN,
      stage_conversions: [], stage_profiles: [],
      error: 'F_A0, C_A0, and k must be positive.' };
  }

  const { stage_conversions, stage_profiles } = simulateMixed(F_A0, C_A0, k, order, reactors);
  const X = stage_conversions.at(-1)!;
  const validConversion = X >= 0 && X <= 1;

  return { ok: validConversion, validConversion, X, stage_conversions, stage_profiles };
}
