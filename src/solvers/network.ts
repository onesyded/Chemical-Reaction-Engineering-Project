/**
 * General Reactor Network Solver — Series and Parallel Combinations
 *
 * Handles any combination of CSTRs and PFRs connected in series and/or
 * parallel. The network is described as an ordered list of "stages":
 *
 *   Series connection: stages execute sequentially; the outlet conversion of
 *   stage i is the inlet conversion of stage i+1.
 *
 *   Parallel block: F_A0 is split among independent trains according to
 *   flow_fractions. Each train is simulated independently (with its fraction
 *   of F_A0). Outlet streams are recombined by the flow-weighted mixing rule:
 *
 *       X_mix = Σ_i α_i · X_i     (α_i = flow fraction of train i)
 *
 * After mixing, subsequent series stages see X_in = X_mix and the full F_A0.
 *
 * Sizing: all NetworkReactor units carry volume_fraction (relative to the
 * network total volume, auto-normalised). Bisection on V_total finds the
 * network volume that achieves X_target.
 *
 * Conversion: all NetworkReactor units carry explicit volume (m³).
 */

import { pfrExitConversion, cstrExitConversion, bisect } from './utils';
import type {
  NetworkStage,
  NetworkReactor,
  NetworkParallelBlock,
  NetworkReactorResult,
  NetworkParallelResult,
  NetworkStageResult,
  NetworkSizingInput,
  NetworkConversionInput,
  NetworkResult,
  ProfilePoint,
} from './types';

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildPFRProfile(
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

function applyReactor(
  F_A0: number, C_A0: number, k: number, order: number,
  X_in: number, reactor: NetworkReactor, volume: number
): NetworkReactorResult {
  let X_out: number;
  let profile: ProfilePoint[] | null = null;

  if (reactor.kind === 'PFR') {
    X_out = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, X_in, volume)));
    profile = buildPFRProfile(F_A0, C_A0, k, order, X_in, volume);
  } else {
    X_out = Math.max(0, Math.min(1, cstrExitConversion(F_A0, C_A0, k, order, X_in, volume)));
  }

  return { kind: reactor.kind, X_in, X_out, volume, profile };
}

/** Simulate one train (series of reactors) starting from X_in. */
function simulateTrain(
  F_A0_train: number, C_A0: number, k: number, order: number,
  X_in: number, reactors: NetworkReactor[], getVolume: (r: NetworkReactor) => number
): { X_out: number; results: NetworkReactorResult[] } {
  const results: NetworkReactorResult[] = [];
  let X = X_in;
  for (const reactor of reactors) {
    const V = getVolume(reactor);
    const res = applyReactor(F_A0_train, C_A0, k, order, X, reactor, V);
    results.push(res);
    X = res.X_out;
  }
  return { X_out: X, results };
}

/** Simulate the full network. Returns one result per stage. */
function simulateNetwork(
  F_A0: number, C_A0: number, k: number, order: number,
  stages: NetworkStage[], getVolume: (r: NetworkReactor) => number
): NetworkStageResult[] {
  const stageResults: NetworkStageResult[] = [];
  let X_in = 0;

  for (const stage of stages) {
    if (stage.kind === 'CSTR' || stage.kind === 'PFR') {
      const V = getVolume(stage);
      const res = applyReactor(F_A0, C_A0, k, order, X_in, stage, V);
      stageResults.push(res);
      X_in = res.X_out;
    } else {
      // Parallel block
      const block = stage as NetworkParallelBlock;
      const N = block.trains.length;

      // Normalise flow fractions
      const rawFracs = block.flow_fractions ?? Array(N).fill(1);
      const totalFrac = rawFracs.reduce((s, f) => s + f, 0);
      const fracs = rawFracs.map(f => f / totalFrac);

      const train_results: NetworkReactorResult[][] = [];
      let X_mixed = 0;

      for (let i = 0; i < N; i++) {
        const F_train = fracs[i] * F_A0;
        const { X_out, results } = simulateTrain(F_train, C_A0, k, order, X_in, block.trains[i], getVolume);
        train_results.push(results);
        X_mixed += fracs[i] * X_out;
      }

      stageResults.push({
        kind: 'parallel',
        X_in,
        X_out: X_mixed,
        flow_fractions: fracs,
        train_results,
      } as NetworkParallelResult);

      X_in = X_mixed;
    }
  }

  return stageResults;
}

/** Collect all NetworkReactor leaves from stages (for volume_fraction normalisation). */
function collectReactors(stages: NetworkStage[]): NetworkReactor[] {
  const reactors: NetworkReactor[] = [];
  for (const stage of stages) {
    if (stage.kind === 'CSTR' || stage.kind === 'PFR') {
      reactors.push(stage);
    } else {
      for (const train of (stage as NetworkParallelBlock).trains) {
        for (const r of train) reactors.push(r);
      }
    }
  }
  return reactors;
}

/** Final conversion from a list of stage results. */
function finalX(stageResults: NetworkStageResult[]): number {
  if (stageResults.length === 0) return 0;
  const last = stageResults.at(-1)!;
  return last.kind === 'parallel'
    ? (last as NetworkParallelResult).X_out
    : (last as NetworkReactorResult).X_out;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateCommon(F_A0: number, C_A0: number, k: number, stages: NetworkStage[]): string | null {
  if (!stages || stages.length === 0) return 'stages must not be empty.';
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0) return 'F_A0, C_A0, and k must be positive.';

  for (const stage of stages) {
    if (stage.kind === 'parallel') {
      const block = stage as NetworkParallelBlock;
      if (!block.trains || block.trains.length === 0) return 'Each parallel block must have at least one train.';
      if (block.flow_fractions && block.flow_fractions.length !== block.trains.length)
        return 'flow_fractions length must match the number of trains.';
      if (block.flow_fractions && block.flow_fractions.some(f => f <= 0))
        return 'All flow_fractions must be positive.';
    }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function sizeNetwork(input: NetworkSizingInput): NetworkResult {
  const { F_A0, C_A0, k, X_target, stages, order = 1 } = input;

  const validConversion = X_target > 0 && X_target < 1;
  if (!validConversion) {
    return { ok: false, validConversion: false, X: NaN, stage_results: [],
      error: 'X_target must be strictly between 0 and 1.' };
  }

  const err = validateCommon(F_A0, C_A0, k, stages);
  if (err) return { ok: false, validConversion, X: NaN, stage_results: [], error: err };

  const reactors = collectReactors(stages);
  if (reactors.some(r => r.volume_fraction == null || r.volume_fraction! <= 0)) {
    return { ok: false, validConversion, X: NaN, stage_results: [],
      error: 'All reactor units must have a positive volume_fraction for sizing.' };
  }

  // Normalise volume fractions across the whole network
  const totalFrac = reactors.reduce((s, r) => s + r.volume_fraction!, 0);

  const getVolume = (r: NetworkReactor, V_total: number) =>
    (r.volume_fraction! / totalFrac) * V_total;

  // Bisect on V_total
  const simulate = (V_total: number) => {
    const results = simulateNetwork(F_A0, C_A0, k, order, stages,
      (r) => getVolume(r, V_total));
    return finalX(results);
  };

  let V_hi = 1e6;
  if (simulate(V_hi) < X_target) {
    return { ok: false, validConversion, X: NaN, stage_results: [],
      error: 'Cannot reach X_target with the given network configuration.' };
  }

  const V_total = bisect((V) => simulate(V) - X_target, 1e-12, V_hi);
  const stage_results = simulateNetwork(F_A0, C_A0, k, order, stages,
    (r) => getVolume(r, V_total));
  const X = finalX(stage_results);

  return { ok: true, validConversion: X >= 0 && X <= 1, X, V_total, stage_results };
}

export function conversionInNetwork(input: NetworkConversionInput): NetworkResult {
  const { F_A0, C_A0, k, stages, order = 1 } = input;

  const err = validateCommon(F_A0, C_A0, k, stages);
  if (err) return { ok: false, validConversion: false, X: NaN, stage_results: [], error: err };

  const reactors = collectReactors(stages);
  if (reactors.some(r => r.volume == null || r.volume! <= 0)) {
    return { ok: false, validConversion: false, X: NaN, stage_results: [],
      error: 'All reactor units must have a positive volume for conversion calculation.' };
  }

  const stage_results = simulateNetwork(F_A0, C_A0, k, order, stages, (r) => r.volume!);
  const X = finalX(stage_results);
  const validConversion = X >= 0 && X <= 1;

  return { ok: validConversion, validConversion, X, stage_results };
}
