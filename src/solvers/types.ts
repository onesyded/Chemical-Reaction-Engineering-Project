export interface SolverInput {
  F_A0: number;      // Feed molar flow rate (mol/s)
  C_A0: number;      // Feed concentration (mol/m³)
  k: number;         // Reaction rate constant (units depend on order)
  order?: number;    // Reaction order (default: 1)
}

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
