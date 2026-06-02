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
