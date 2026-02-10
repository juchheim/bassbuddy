export type RunMode = "baseline" | "ab" | "phase";
export type Confidence = "high" | "medium" | "low";

export interface FrequencyMeasurement {
  freqHz: number;
  levelRaw: number;
  levelRelDb: number;
}

export interface RunHighlights {
  worstPeakHz: number;
  worstDipHz: number;
  maxPeakDb: number;
  maxDipDb: number;
  deepDipCount: number;
  bigPeakCount: number;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
}

export type MicProcessingRisk = "low" | "unknown" | "high";

export interface MicSettingsSnapshot {
  requested: MediaTrackConstraints;
  supported: {
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  };
  settings: Partial<MediaTrackSettings>;
  capabilities: Record<string, unknown>;
  processingRisk: MicProcessingRisk;
  warnings: string[];
}

export interface BassRun {
  id: string;
  createdAt: string;
  mode: RunMode;
  label?: string;
  deviceInfo: DeviceInfo;
  micSettings: MicSettingsSnapshot;
  sampleRate: number;
  beepDetected: boolean;
  confidence: Confidence;
  measurements: FrequencyMeasurement[];
  score: number;
  highlights: RunHighlights;
  notes?: string;
}

export interface RunsStoreV1 {
  version: 1;
  runs: BassRun[];
}
