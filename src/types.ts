export interface ReactorState {
  type?: 'PFR' | 'CSTR';
  volume?: number;
  conversion?: number;
  profile?: { volume: number; conversion: number }[];
  checks?: {
    validConversion: boolean;
    positiveVolume: boolean;
  };
  ok?: boolean;
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
