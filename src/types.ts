export interface ReactorState {
  type?: 'PFR' | 'CSTR';
  volume?: number;
  conversion?: number;
  // Inputs echoed back for the telemetry readout
  order?: number;
  k?: number;
  F_A0?: number;
  C_A0?: number;
  profile?: { volume: number; conversion: number }[];
  checks?: {
    validConversion: boolean;
    positiveVolume: boolean;
  };
  ok?: boolean;
  // Populated when a solver rejects the inputs (ok === false)
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
}

export interface ChatResponse {
  history: ChatMessage[];
  reactorState: ReactorState | null;
}
