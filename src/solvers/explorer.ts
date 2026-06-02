/**
 * Reactor Explorer
 *
 * Given a reaction description the explorer automatically tries every
 * meaningful reactor configuration and ranks the results.
 *
 * Forward problem — exploreForTarget(input):
 *   Given X_target → enumerate all configs, find V_total for each,
 *   rank ascending by V_total (smallest volume = most efficient).
 *
 * Inverse problem — exploreForConversion(input):
 *   Given V_total → enumerate all configs, find X for each,
 *   rank descending by X (highest conversion = most efficient).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Configurations enumerated
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Single reactors
 *   single_cstr          Single CSTR
 *   single_pfr           Single PFR   ← optimal baseline for simple kinetics
 *
 * N equal-volume CSTRs in series  (N → ∞ approaches PFR)
 *   cstr_series_2        2 CSTRs equal
 *   cstr_series_3        3 CSTRs equal
 *   cstr_series_5        5 CSTRs equal
 *   cstr_series_10       10 CSTRs equal
 *
 * Optimal-split CSTR series (min V for given X, or max X for given V)
 *   cstr_series_2_opt    2 CSTRs — volume split found by golden search
 *   cstr_series_3_opt    3 CSTRs — intermediate X values from 2D grid search
 *
 * Mixed CSTR + PFR in series
 *   cstr_pfr_equal       CSTR → PFR  (50 / 50 volume split)
 *   pfr_cstr_equal       PFR → CSTR  (50 / 50 volume split)
 *   cstr_pfr_opt         CSTR → PFR  optimal split (golden search)
 *   pfr_cstr_opt         PFR → CSTR  optimal split (golden search)
 *
 * Parallel arrangements
 *   cstr_par_cstr        CSTR ‖ CSTR  equal flow + equal volume
 *                          (equivalent to 1 CSTR of same total V — illustrative)
 *   pfr_par_pfr          PFR ‖ PFR   equal flow + equal volume
 *                          (equivalent to 1 PFR of same total V — illustrative)
 *   cstr_par_pfr         CSTR ‖ PFR  equal flow + equal volume per unit
 *
 * Series + Parallel
 *   pfr_then_2cstr_par   PFR → (CSTR ‖ CSTR)  PFR:50%, each CSTR:25%
 *   cstr_then_2pfr_par   CSTR → (PFR ‖ PFR)   CSTR:50%, each PFR:25%
 *   par_cstr_pfr_cstr    (CSTR ‖ PFR) → CSTR  each parallel:33%, final CSTR:33%
 */

import {
  pfrExitConversion, cstrExitConversion,
  levenspielIntegrand, integrate, bisect, goldenSearch,
} from './utils';
import type {
  ExplorerInput, ExplorerSizingResult, ConfigSizingResult,
  ExplorerConversionInput, ExplorerConversionResult, ConfigConversionResult,
} from './types';

// ── Low-level sizing primitives ───────────────────────────────────────────────

function pfrVolume(F_A0: number, C_A0: number, k: number, order: number, X_target: number): number {
  return integrate((X) => levenspielIntegrand(F_A0, k, C_A0, X, order), 0, X_target);
}

function cstrVolume(F_A0: number, C_A0: number, k: number, order: number, X: number): number {
  const r = k * Math.pow(C_A0 * (1 - X), order);
  if (r <= 0) return Infinity;
  return (F_A0 * X) / r;
}

/** Volume of a CSTR stage: inlet X_in, outlet X_out. */
function cstrStageVolume(
  F_A0: number, C_A0: number, k: number, order: number, X_in: number, X_out: number
): number {
  const r = k * Math.pow(C_A0 * (1 - X_out), order);
  if (r <= 0) return Infinity;
  return (F_A0 * (X_out - X_in)) / r;
}

/** Volume of a PFR stage: inlet X_in, outlet X_out. */
function pfrStageVolume(
  F_A0: number, C_A0: number, k: number, order: number, X_in: number, X_out: number
): number {
  return integrate((X) => levenspielIntegrand(F_A0, k, C_A0, X, order), X_in, X_out);
}

// ── Optimal-split helpers ─────────────────────────────────────────────────────

/**
 * Find optimal intermediate conversion X_1 for a 2-stage series (A then B)
 * that minimises total volume to reach X_target.
 * stageVol_A(X_1) = volume of stage A from 0 → X_1
 * stageVol_B(X_1) = volume of stage B from X_1 → X_target
 */
function optimalSplit2(
  stageVolA: (x1: number) => number,
  stageVolB: (x1: number) => number,
  X_target: number
): number {
  const eps = 1e-4;
  return goldenSearch((x1) => stageVolA(x1) + stageVolB(x1), eps, X_target - eps);
}

/**
 * Find optimal (X_1, X_2) for a 3-stage series that minimises total volume.
 * Uses a 2D grid search (30×30) then refines each dimension once.
 */
function optimalSplit3(
  volA: (x1: number) => number,
  volB: (x1: number, x2: number) => number,
  volC: (x2: number) => number,
  X_target: number
): [number, number] {
  const N = 30;
  const eps = 1e-4;
  let best = Infinity, bx1 = X_target / 3, bx2 = 2 * X_target / 3;

  for (let i = 1; i < N; i++) {
    const x1 = eps + (X_target - 2 * eps) * i / N;
    for (let j = i + 1; j < N; j++) {
      const x2 = eps + (X_target - 2 * eps) * j / N;
      if (x2 >= X_target) break;
      const V = volA(x1) + volB(x1, x2) + volC(x2);
      if (V < best) { best = V; bx1 = x1; bx2 = x2; }
    }
  }

  // Refine X_1 with X_2 fixed
  bx1 = goldenSearch((x1) => volA(x1) + volB(x1, bx2), eps, bx2 - eps);
  // Refine X_2 with X_1 fixed
  bx2 = goldenSearch((x2) => volB(bx1, x2) + volC(x2), bx1 + eps, X_target - eps);

  return [bx1, bx2];
}

// ── Sizing: enumerate all configs for a given X_target ────────────────────────

export function exploreForTarget(input: ExplorerInput): ExplorerSizingResult {
  const { F_A0, C_A0, k, X_target, order = 1 } = input;

  if (X_target <= 0 || X_target >= 1)
    return { ok: false, error: 'X_target must be strictly between 0 and 1.',
      X_target, V_pfr: NaN, V_cstr: NaN, ranked: [] };
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0)
    return { ok: false, error: 'F_A0, C_A0, and k must be positive.',
      X_target, V_pfr: NaN, V_cstr: NaN, ranked: [] };

  const eps = 1e-9;
  const p = { F_A0, C_A0, k, order };

  const V_pfr = pfrVolume(F_A0, C_A0, k, order, X_target);
  const V_cstr = cstrVolume(F_A0, C_A0, k, order, X_target);

  const results: ConfigSizingResult[] = [];

  function add(id: string, label: string, V_total: number, stage_conversions: number[]) {
    if (!isFinite(V_total) || V_total <= 0) return;
    results.push({ id, label, V_total, efficiency: V_pfr / V_total, stage_conversions });
  }

  // ── 1. Single reactors ────────────────────────────────────────────────────
  add('single_cstr', 'Single CSTR', V_cstr, [X_target]);
  add('single_pfr',  'Single PFR',  V_pfr,  [X_target]);

  // ── 2. N equal CSTRs in series ────────────────────────────────────────────
  for (const N of [2, 3, 5, 10]) {
    // Find V_each by bisecting: simulate N equal-CSTR train, hit X_target
    const finalX = (V_each: number) => {
      let X = 0;
      for (let i = 0; i < N; i++) X = cstrExitConversion(F_A0, C_A0, k, order, X, V_each);
      return X;
    };
    if (finalX(V_cstr * 10) < X_target) continue;
    const V_each = bisect((V) => finalX(V) - X_target, eps, V_cstr * 10);
    const stage_convs: number[] = [];
    let X = 0;
    for (let i = 0; i < N; i++) { X = cstrExitConversion(F_A0, C_A0, k, order, X, V_each); stage_convs.push(X); }
    add(`cstr_series_${N}`, `${N} CSTRs in series (equal volume)`, V_each * N, stage_convs);
  }

  // ── 3. Optimal-split 2 CSTRs ──────────────────────────────────────────────
  {
    const X_1_opt = optimalSplit2(
      (x1) => cstrStageVolume(F_A0, C_A0, k, order, 0, x1),
      (x1) => cstrStageVolume(F_A0, C_A0, k, order, x1, X_target),
      X_target
    );
    const V1 = cstrStageVolume(F_A0, C_A0, k, order, 0, X_1_opt);
    const V2 = cstrStageVolume(F_A0, C_A0, k, order, X_1_opt, X_target);
    add('cstr_series_2_opt', '2 CSTRs in series (optimal volume split)',
      V1 + V2, [X_1_opt, X_target]);
  }

  // ── 4. Optimal-split 3 CSTRs ──────────────────────────────────────────────
  {
    const [X1, X2] = optimalSplit3(
      (x1) => cstrStageVolume(F_A0, C_A0, k, order, 0, x1),
      (x1, x2) => cstrStageVolume(F_A0, C_A0, k, order, x1, x2),
      (x2) => cstrStageVolume(F_A0, C_A0, k, order, x2, X_target),
      X_target
    );
    const Vtot = cstrStageVolume(F_A0, C_A0, k, order, 0, X1)
               + cstrStageVolume(F_A0, C_A0, k, order, X1, X2)
               + cstrStageVolume(F_A0, C_A0, k, order, X2, X_target);
    add('cstr_series_3_opt', '3 CSTRs in series (optimal volume split)',
      Vtot, [X1, X2, X_target]);
  }

  // ── 5. Mixed series CSTR → PFR (equal 50/50) ─────────────────────────────
  {
    const findV = (V_total: number) => {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V_total / 2);
      return pfrExitConversion(F_A0, C_A0, k, order, X1, V_total / 2);
    };
    if (findV(V_cstr * 20) >= X_target) {
      const V = bisect((V) => findV(V) - X_target, eps, V_cstr * 20);
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V / 2);
      add('cstr_pfr_equal', 'CSTR → PFR (equal 50/50 volume split)', V, [X1, X_target]);
    }
  }

  // ── 6. Mixed series PFR → CSTR (equal 50/50) ─────────────────────────────
  {
    const findV = (V_total: number) => {
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V_total / 2);
      return cstrExitConversion(F_A0, C_A0, k, order, X1, V_total / 2);
    };
    if (findV(V_cstr * 20) >= X_target) {
      const V = bisect((V) => findV(V) - X_target, eps, V_cstr * 20);
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V / 2);
      add('pfr_cstr_equal', 'PFR → CSTR (equal 50/50 volume split)', V, [X1, X_target]);
    }
  }

  // ── 7. CSTR → PFR (optimal split) ────────────────────────────────────────
  {
    const totalVol = (f: number) => {
      const V_cstr_part = cstrStageVolume(F_A0, C_A0, k, order, 0,
        bisect((X) => cstrExitConversion(F_A0, C_A0, k, order, 0, X * f) - X, eps, X_target - eps) * 0 // hack: use direct
      );
      // Simpler: bisect on V_total with fraction f going to CSTR
      return NaN; // placeholder — use approach below
    };
    // Find optimal fraction f ∈ (0,1) of V_total going to CSTR
    const fullV = (f: number, V_total: number) => {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, f * V_total);
      return pfrExitConversion(F_A0, C_A0, k, order, X1, (1 - f) * V_total);
    };
    // For each f, find V_total that achieves X_target
    const VforF = (f: number) => {
      const check = (V: number) => fullV(f, V);
      if (check(V_cstr * 20) < X_target) return Infinity;
      return bisect((V) => check(V) - X_target, eps, V_cstr * 20);
    };
    const f_opt = goldenSearch(VforF, 0.05, 0.95);
    const V_opt = VforF(f_opt);
    if (isFinite(V_opt)) {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, f_opt * V_opt);
      add('cstr_pfr_opt', 'CSTR → PFR (optimal volume split)', V_opt, [X1, X_target]);
    }
  }

  // ── 8. PFR → CSTR (optimal split) ────────────────────────────────────────
  {
    const VforF = (f: number) => {
      const check = (V: number) => {
        const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, f * V);
        return cstrExitConversion(F_A0, C_A0, k, order, X1, (1 - f) * V);
      };
      if (check(V_cstr * 20) < X_target) return Infinity;
      return bisect((V) => check(V) - X_target, eps, V_cstr * 20);
    };
    const f_opt = goldenSearch(VforF, 0.05, 0.95);
    const V_opt = VforF(f_opt);
    if (isFinite(V_opt)) {
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, f_opt * V_opt);
      add('pfr_cstr_opt', 'PFR → CSTR (optimal volume split)', V_opt, [X1, X_target]);
    }
  }

  // ── 9. CSTR ‖ CSTR (equal flow + equal volume per unit) ──────────────────
  // Each unit gets F_A0/2, so τ_per_unit = C_A0*(V_each)/(F_A0/2) = same as
  // 1 CSTR with volume 2*V_each and full F_A0. Equivalent to single CSTR.
  {
    const V_each = cstrVolume(F_A0 / 2, C_A0, k, order, X_target);
    const X1 = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_each);
    add('cstr_par_cstr', 'CSTR ‖ CSTR (equal flow split, equal volume)',
      2 * V_each, [X1, X1]);
  }

  // ── 10. PFR ‖ PFR (equal flow + equal volume per unit) ───────────────────
  {
    const V_each = pfrVolume(F_A0 / 2, C_A0, k, order, X_target);
    const X1 = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_each);
    add('pfr_par_pfr', 'PFR ‖ PFR (equal flow split, equal volume)',
      2 * V_each, [X1, X1]);
  }

  // ── 11. CSTR ‖ PFR (equal flow, each sized to hit X_target) ──────────────
  {
    const V_cstr_half = cstrVolume(F_A0 / 2, C_A0, k, order, X_target);
    const V_pfr_half  = pfrVolume(F_A0 / 2, C_A0, k, order, X_target);
    // Mixed outlet: 0.5*X_target + 0.5*X_target = X_target ✓
    add('cstr_par_pfr', 'CSTR ‖ PFR (equal flow split, each reaches X_target)',
      V_cstr_half + V_pfr_half, [X_target, X_target]);
  }

  // ── 12. PFR → (CSTR ‖ CSTR) — PFR 50%, each CSTR 25% ────────────────────
  {
    const VforTotal = (V: number) => {
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V * 0.5);
      // Each CSTR: F_A0/2, volume V*0.25, inlet X1
      const X2a = cstrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      const X2b = cstrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      return 0.5 * X2a + 0.5 * X2b; // flow-weighted mix
    };
    if (VforTotal(V_cstr * 20) >= X_target) {
      const V = bisect((V) => VforTotal(V) - X_target, eps, V_cstr * 20);
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V * 0.5);
      const X2 = cstrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      add('pfr_then_2cstr_par',
        'PFR → (CSTR ‖ CSTR) [PFR:50%, each CSTR:25%]',
        V, [X1, X2, X2]);
    }
  }

  // ── 13. CSTR → (PFR ‖ PFR) — CSTR 50%, each PFR 25% ────────────────────
  {
    const VforTotal = (V: number) => {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V * 0.5);
      const X2a = pfrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      const X2b = pfrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      return 0.5 * X2a + 0.5 * X2b;
    };
    if (VforTotal(V_cstr * 20) >= X_target) {
      const V = bisect((V) => VforTotal(V) - X_target, eps, V_cstr * 20);
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V * 0.5);
      const X2 = pfrExitConversion(F_A0 / 2, C_A0, k, order, X1, V * 0.25);
      add('cstr_then_2pfr_par',
        'CSTR → (PFR ‖ PFR) [CSTR:50%, each PFR:25%]',
        V, [X1, X2, X2]);
    }
  }

  // ── 14. (CSTR ‖ PFR) → CSTR — each parallel 33%, final CSTR 33% ─────────
  {
    const VforTotal = (V: number) => {
      const X_cstr_par = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V / 3);
      const X_pfr_par  = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V / 3);
      const X_mix = 0.5 * X_cstr_par + 0.5 * X_pfr_par;
      return cstrExitConversion(F_A0, C_A0, k, order, X_mix, V / 3);
    };
    if (VforTotal(V_cstr * 20) >= X_target) {
      const V = bisect((V) => VforTotal(V) - X_target, eps, V_cstr * 20);
      const X_cp = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V / 3);
      const X_pp = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V / 3);
      const X_mix = 0.5 * X_cp + 0.5 * X_pp;
      add('par_cstr_pfr_then_cstr',
        '(CSTR ‖ PFR) → CSTR [each unit ~33% of V]',
        V, [X_cp, X_pp, X_mix, X_target]);
    }
  }

  // Sort ascending by V_total (best = least volume first)
  results.sort((a, b) => a.V_total - b.V_total);

  return { ok: true, X_target, V_pfr, V_cstr, ranked: results };
}

// ── Conversion: enumerate all configs for a given V_total ─────────────────────

export function exploreForConversion(input: ExplorerConversionInput): ExplorerConversionResult {
  const { F_A0, C_A0, k, V_total, order = 1 } = input;

  if (V_total <= 0)
    return { ok: false, error: 'V_total must be positive.',
      V_total, X_pfr: NaN, X_cstr: NaN, ranked: [] };
  if (F_A0 <= 0 || C_A0 <= 0 || k <= 0)
    return { ok: false, error: 'F_A0, C_A0, and k must be positive.',
      V_total, X_pfr: NaN, X_cstr: NaN, ranked: [] };

  const X_pfr  = Math.max(0, Math.min(1, pfrExitConversion(F_A0, C_A0, k, order, 0, V_total)));
  const X_cstr = Math.max(0, Math.min(1, cstrExitConversion(F_A0, C_A0, k, order, 0, V_total)));

  const results: ConfigConversionResult[] = [];

  function add(id: string, label: string, X: number, stage_conversions: number[]) {
    if (!isFinite(X) || X < 0) return;
    X = Math.min(1, X);
    results.push({ id, label, X, efficiency: X_pfr > 0 ? X / X_pfr : 1, stage_conversions });
  }

  // ── 1. Single reactors ────────────────────────────────────────────────────
  add('single_cstr', 'Single CSTR', X_cstr, [X_cstr]);
  add('single_pfr',  'Single PFR',  X_pfr,  [X_pfr]);

  // ── 2. N equal CSTRs in series ────────────────────────────────────────────
  for (const N of [2, 3, 5, 10]) {
    let X = 0;
    const stages: number[] = [];
    for (let i = 0; i < N; i++) {
      X = Math.max(0, Math.min(1, cstrExitConversion(F_A0, C_A0, k, order, X, V_total / N)));
      stages.push(X);
    }
    add(`cstr_series_${N}`, `${N} CSTRs in series (equal volume)`, X, stages);
  }

  // ── 3. Optimal-split 2 CSTRs (maximise X given V_total) ──────────────────
  {
    const finalX = (f: number) => {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, f * V_total);
      return cstrExitConversion(F_A0, C_A0, k, order, X1, (1 - f) * V_total);
    };
    const f_opt = goldenSearch((f) => -finalX(f), 0.01, 0.99);
    const X1_opt = cstrExitConversion(F_A0, C_A0, k, order, 0, f_opt * V_total);
    const X2_opt = cstrExitConversion(F_A0, C_A0, k, order, X1_opt, (1 - f_opt) * V_total);
    add('cstr_series_2_opt', '2 CSTRs in series (optimal volume split)',
      X2_opt, [X1_opt, X2_opt]);
  }

  // ── 4. Mixed series (equal 50/50) ─────────────────────────────────────────
  {
    const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V_total / 2);
    const X2 = pfrExitConversion(F_A0, C_A0, k, order, X1, V_total / 2);
    add('cstr_pfr_equal', 'CSTR → PFR (equal 50/50 volume split)', X2, [X1, X2]);
  }
  {
    const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V_total / 2);
    const X2 = cstrExitConversion(F_A0, C_A0, k, order, X1, V_total / 2);
    add('pfr_cstr_equal', 'PFR → CSTR (equal 50/50 volume split)', X2, [X1, X2]);
  }

  // ── 5. Mixed series (optimal split) ──────────────────────────────────────
  {
    const f_opt = goldenSearch((f) => {
      const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, f * V_total);
      return -pfrExitConversion(F_A0, C_A0, k, order, X1, (1 - f) * V_total);
    }, 0.01, 0.99);
    const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, f_opt * V_total);
    const X2 = pfrExitConversion(F_A0, C_A0, k, order, X1, (1 - f_opt) * V_total);
    add('cstr_pfr_opt', 'CSTR → PFR (optimal volume split)', X2, [X1, X2]);
  }
  {
    const f_opt = goldenSearch((f) => {
      const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, f * V_total);
      return -cstrExitConversion(F_A0, C_A0, k, order, X1, (1 - f) * V_total);
    }, 0.01, 0.99);
    const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, f_opt * V_total);
    const X2 = cstrExitConversion(F_A0, C_A0, k, order, X1, (1 - f_opt) * V_total);
    add('pfr_cstr_opt', 'PFR → CSTR (optimal volume split)', X2, [X1, X2]);
  }

  // ── 6. Parallel (each unit gets V_total/2 and F_A0/2) ────────────────────
  {
    const Xp = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 2);
    add('cstr_par_cstr', 'CSTR ‖ CSTR (equal flow + equal volume)', Xp, [Xp, Xp]);
  }
  {
    const Xp = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 2);
    add('pfr_par_pfr', 'PFR ‖ PFR (equal flow + equal volume)', Xp, [Xp, Xp]);
  }
  {
    const Xc = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 2);
    const Xp = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 2);
    add('cstr_par_pfr', 'CSTR ‖ PFR (equal flow + equal volume)', 0.5 * Xc + 0.5 * Xp, [Xc, Xp]);
  }

  // ── 7. PFR → (CSTR ‖ CSTR) ───────────────────────────────────────────────
  {
    const X1 = pfrExitConversion(F_A0, C_A0, k, order, 0, V_total * 0.5);
    const X2 = cstrExitConversion(F_A0 / 2, C_A0, k, order, X1, V_total * 0.25);
    add('pfr_then_2cstr_par', 'PFR → (CSTR ‖ CSTR) [PFR:50%, each CSTR:25%]',
      X2, [X1, X2, X2]);
  }

  // ── 8. CSTR → (PFR ‖ PFR) ────────────────────────────────────────────────
  {
    const X1 = cstrExitConversion(F_A0, C_A0, k, order, 0, V_total * 0.5);
    const X2 = pfrExitConversion(F_A0 / 2, C_A0, k, order, X1, V_total * 0.25);
    add('cstr_then_2pfr_par', 'CSTR → (PFR ‖ PFR) [CSTR:50%, each PFR:25%]',
      X2, [X1, X2, X2]);
  }

  // ── 9. (CSTR ‖ PFR) → CSTR ───────────────────────────────────────────────
  {
    const Xc = cstrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 3);
    const Xp = pfrExitConversion(F_A0 / 2, C_A0, k, order, 0, V_total / 3);
    const Xmix = 0.5 * Xc + 0.5 * Xp;
    const Xfinal = cstrExitConversion(F_A0, C_A0, k, order, Xmix, V_total / 3);
    add('par_cstr_pfr_then_cstr', '(CSTR ‖ PFR) → CSTR [each unit ~33% of V]',
      Xfinal, [Xc, Xp, Xmix, Xfinal]);
  }

  // Sort descending by X (best conversion first)
  results.sort((a, b) => b.X - a.X);

  return { ok: true, V_total, X_pfr, X_cstr, ranked: results };
}
