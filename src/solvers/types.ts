// ── Shared base ──────────────────────────────────────────────────────────────

export interface SolverInput {
  F_A0: number;      // Feed molar flow rate (mol/s)
  C_A0: number;      // Feed concentration (mol/m³)
  k: number;         // Reaction rate constant (units depend on order)
  order?: number;    // Reaction order (default: 1)
}

// ── PFR / CSTR ───────────────────────────────────────────────────────────────

export interface SizingInput extends SolverInput {
  X_target: number;  // Target conversion (0 < X < 1)
}

export interface ConversionInput extends SolverInput {
  V: number;         // Reactor volume (m³)
}

export interface ProfilePoint {
  volume: number;
  conversion: number;
}

export interface SolverResult {
  ok: boolean;
  validConversion: boolean;
  positiveVolume: boolean;
  error?: string;
}

export interface SizingResult extends SolverResult {
  V: number;
  profile?: ProfilePoint[];
}

export interface ConversionResult extends SolverResult {
  X: number;
  profile?: ProfilePoint[];
}

// ── Batch Reactor ─────────────────────────────────────────────────────────────
// Design equation: t = C_A0 ∫₀^X dX / (-r_A)
// where -r_A = k · C_A0ⁿ · (1 - X)ⁿ

export interface BatchSizingInput {
  C_A0: number;      // Initial concentration (mol/m³)
  k: number;         // Rate constant (1/s for first order)
  X_target: number;  // Target conversion (0 < X < 1)
  order?: number;    // Reaction order (default: 1)
}

export interface BatchConversionInput {
  C_A0: number;      // Initial concentration (mol/m³)
  k: number;         // Rate constant
  t: number;         // Reaction time (s)
  order?: number;
}

export interface BatchProfilePoint {
  time: number;
  conversion: number;
}

export interface BatchResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface BatchSizingResult extends BatchResult {
  t: number;         // Time required to reach X_target (s)
  profile: BatchProfilePoint[];
}

export interface BatchConversionResult extends BatchResult {
  X: number;
  profile: BatchProfilePoint[];
}

// ── Packed Bed Reactor (PBR) ──────────────────────────────────────────────────
// Design equation: W = F_A0 ∫₀^X dX / (-r'_A)
// where -r'_A = k' · C_A^n  (rate per unit catalyst weight, mol/(kg_cat·s))

export interface PBRSizingInput {
  F_A0: number;      // Feed molar flow rate (mol/s)
  C_A0: number;      // Feed concentration (mol/m³)
  k_prime: number;   // Catalyst rate constant (m³ⁿ·mol¹⁻ⁿ·kg_cat⁻¹·s⁻¹)
  X_target: number;  // Target conversion (0 < X < 1)
  order?: number;
}

export interface PBRConversionInput {
  F_A0: number;
  C_A0: number;
  k_prime: number;
  W: number;         // Catalyst weight (kg)
  order?: number;
}

export interface PBRProfilePoint {
  weight: number;    // Cumulative catalyst weight (kg)
  conversion: number;
}

export interface PBRResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface PBRSizingResult extends PBRResult {
  W: number;         // Catalyst weight required (kg)
  profile: PBRProfilePoint[];
}

export interface PBRConversionResult extends PBRResult {
  X: number;
  profile: PBRProfilePoint[];
}

// ── CSTRs in Series ───────────────────────────────────────────────────────────
// Design equation per stage: V_i · (-r_A(X_i)) = F_A0 · (X_i - X_{i-1})
// Equal-volume CSTRs: find V_each such that N stages reach X_target.

export interface CSTRSeriesSizingInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;  // Overall target conversion
  N: number;         // Number of CSTRs in series (integer ≥ 1)
  order?: number;
}

export interface CSTRSeriesConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  V_each: number;    // Volume of each CSTR (m³)
  N: number;         // Number of CSTRs in series
  order?: number;
}

export interface CSTRSeriesResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface CSTRSeriesSizingResult extends CSTRSeriesResult {
  V_each: number;    // Volume of each individual CSTR (m³)
  V_total: number;   // Total volume (m³)
  stage_conversions: number[];  // Conversion exiting each stage
}

export interface CSTRSeriesConversionResult extends CSTRSeriesResult {
  X: number;                    // Final overall conversion
  stage_conversions: number[];
}

// ── PFRs in Series ────────────────────────────────────────────────────────────
// Mathematically equivalent to one big PFR (volumes add), but tracks
// stage-by-stage conversions and per-reactor profiles.
//
// Design equation per segment i (inlet X_{i-1}, outlet X_i, volume V_i):
//   V_i = F_A0 · ∫_{X_{i-1}}^{X_i}  dX / (-r_A)

export interface PFRSeriesSizingInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;
  N: number;          // Number of equal-volume PFRs in series (integer ≥ 1)
  order?: number;
}

export interface PFRSeriesConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  volumes: number[];  // Volume of each PFR in sequence (m³)
  order?: number;
}

export interface PFRSeriesResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface PFRSeriesSizingResult extends PFRSeriesResult {
  V_each: number;
  V_total: number;
  stage_conversions: number[];
  stage_profiles: ProfilePoint[][];
}

export interface PFRSeriesConversionResult extends PFRSeriesResult {
  X: number;
  stage_conversions: number[];
  stage_profiles: ProfilePoint[][];
}

// ── CSTRs of Unequal Volumes in Series ───────────────────────────────────────
// Same mole balance as equal-volume series, but each V_i is independent.
//
// Design equation per stage i:
//   V_i · (-r_A(X_i)) = F_A0 · (X_i - X_{i-1})
//
// Sizing: supply relative volume fractions (need not sum to 1 — they will be
// normalised internally) and a target conversion; solver finds V_total and
// scales each reactor accordingly.

export interface CSTRUnequalSizingInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;
  volume_fractions: number[];   // Relative sizes of each CSTR (auto-normalised)
  order?: number;
}

export interface CSTRUnequalConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  volumes: number[];            // Actual volume of each CSTR (m³)
  order?: number;
}

export interface CSTRUnequalResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface CSTRUnequalSizingResult extends CSTRUnequalResult {
  volumes: number[];            // Actual volume of each CSTR (m³)
  V_total: number;
  stage_conversions: number[];
}

export interface CSTRUnequalConversionResult extends CSTRUnequalResult {
  X: number;
  stage_conversions: number[];
}

// ── Mixed CSTR + PFR Reactor Network ─────────────────────────────────────────
// An ordered sequence of CSTRs and PFRs in series.
//
// Each element specifies its type; sizing uses relative volume fractions
// across the whole train to find V_total.

export type ReactorUnitType = 'CSTR' | 'PFR';

export interface ReactorUnit {
  type: ReactorUnitType;
  volume: number;   // m³
}

export interface MixedSizingInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;
  // Ordered configuration — fractions need not sum to 1 (auto-normalised)
  configuration: Array<{ type: ReactorUnitType; volume_fraction: number }>;
  order?: number;
}

export interface MixedConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  reactors: ReactorUnit[];    // Ordered sequence with known volumes
  order?: number;
}

export interface MixedResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
}

export interface MixedSizingResult extends MixedResult {
  reactors: ReactorUnit[];
  V_total: number;
  stage_conversions: number[];
  // PFR stages include a spatial profile; CSTR stages are null
  stage_profiles: Array<ProfilePoint[] | null>;
}

export interface MixedConversionResult extends MixedResult {
  X: number;
  stage_conversions: number[];
  stage_profiles: Array<ProfilePoint[] | null>;
}

// ── General Reactor Network (Series + Parallel) ───────────────────────────────
//
// A network is a sequence of "stages". Each stage is either:
//   • A single reactor (CSTR or PFR) — flow passes straight through.
//   • A parallel block — flow is split among independent trains, each train
//     being its own series of single reactors, then recombined.
//
// Series connection between stages is implicit (outlet of stage i → inlet of stage i+1).
//
// Design equations:
//   PFR unit:  V_i = F_A0,train · ∫_{X_in}^{X_out} dX / (-r_A)
//   CSTR unit: V_i · (-r_A(X_out)) = F_A0,train · (X_out - X_in)
//
// Mixing rule after a parallel block (flow-weighted average):
//   X_mix = Σ_i α_i · X_i     where α_i = F_A0,i / F_A0
//
// For sizing: each unit carries a volume_fraction (relative to network V_total,
// auto-normalised). Bisection finds V_total that achieves X_target.
// For conversion: each unit carries an explicit volume (m³).

export interface NetworkReactor {
  kind: 'CSTR' | 'PFR';
  volume_fraction?: number;   // for sizing (relative to network V_total, auto-normalised)
  volume?: number;            // for conversion calculation (m³)
}

export interface NetworkParallelBlock {
  kind: 'parallel';
  // Each train is an ordered series of single reactors.
  trains: NetworkReactor[][];
  // How F_A0 is split among trains (auto-normalised, default: equal split).
  flow_fractions?: number[];
}

export type NetworkStage = NetworkReactor | NetworkParallelBlock;

// ── Network result types ──────────────────────────────────────────────────────

export interface NetworkReactorResult {
  kind: 'CSTR' | 'PFR';
  X_in: number;
  X_out: number;
  volume: number;
  profile: ProfilePoint[] | null;   // spatial profile for PFR, null for CSTR
}

export interface NetworkParallelResult {
  kind: 'parallel';
  X_in: number;
  X_out: number;                     // flow-weighted mixed outlet conversion
  flow_fractions: number[];          // normalised flow fractions used
  train_results: NetworkReactorResult[][];
}

export type NetworkStageResult = NetworkReactorResult | NetworkParallelResult;

export interface NetworkSizingInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;
  stages: NetworkStage[];
  order?: number;
}

export interface NetworkConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  stages: NetworkStage[];
  order?: number;
}

export interface NetworkResult {
  ok: boolean;
  validConversion: boolean;
  error?: string;
  X: number;
  V_total?: number;                  // total network volume (sizing only)
  stage_results: NetworkStageResult[];
}

// ── Reactor Explorer ──────────────────────────────────────────────────────────
//
// Given a reaction description, the explorer automatically tries every
// meaningful reactor configuration — single, series, parallel, and mixed —
// and ranks the results.
//
// Forward problem: given X_target → find V_total for each configuration.
//   Ranked ascending by V_total (smallest = most efficient).
//
// Inverse problem: given V_total → find X achieved by each configuration.
//   Ranked descending by X (highest = most efficient).
//
// efficiency (sizing):   V_pfr / V_total  (1.0 = as good as PFR, <1.0 = worse)
// efficiency (conversion): X / X_pfr      (1.0 = matches PFR performance)

export interface ExplorerInput {
  F_A0: number;
  C_A0: number;
  k: number;
  X_target: number;  // target conversion (0 < X < 1)
  order?: number;
}

export interface ConfigSizingResult {
  label: string;              // human-readable description
  id: string;                 // machine-readable key
  V_total: number;            // total volume required (m³)
  efficiency: number;         // V_pfr / V_total
  stage_conversions: number[];
}

export interface ExplorerSizingResult {
  ok: boolean;
  error?: string;
  X_target: number;
  V_pfr: number;              // single PFR baseline
  V_cstr: number;             // single CSTR baseline
  ranked: ConfigSizingResult[];  // sorted V_total ascending (best first)
}

export interface ExplorerConversionInput {
  F_A0: number;
  C_A0: number;
  k: number;
  V_total: number;            // total volume available (m³)
  order?: number;
}

export interface ConfigConversionResult {
  label: string;
  id: string;
  X: number;                  // conversion achieved
  efficiency: number;         // X / X_pfr
  stage_conversions: number[];
}

export interface ExplorerConversionResult {
  ok: boolean;
  error?: string;
  V_total: number;
  X_pfr: number;              // single PFR baseline
  X_cstr: number;             // single CSTR baseline
  ranked: ConfigConversionResult[];  // sorted X descending (best first)
}
