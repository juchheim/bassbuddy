export interface PlacementBand {
  key: string;
  label: string;
  minHz: number;
  maxHz: number;
}

// Ordered bands keep v1 focused on subwoofer placement while remaining easy to extend later.
export const DEFAULT_PLACEMENT_BANDS: PlacementBand[] = [
  { key: "band_20_31_5", label: "20–31.5 Hz", minHz: 20, maxHz: 31.5 },
  { key: "band_31_5_50", label: "31.5–50 Hz", minHz: 31.5, maxHz: 50 },
  { key: "band_50_80", label: "50–80 Hz", minHz: 50, maxHz: 80 },
  { key: "band_80_120", label: "80–120 Hz", minHz: 80, maxHz: 120 }
];

export function isFrequencyInBand(frequencyHz: number, band: PlacementBand, bandIndex: number): boolean {
  if (bandIndex === 0) {
    return frequencyHz >= band.minHz && frequencyHz <= band.maxHz;
  }

  return frequencyHz > band.minHz && frequencyHz <= band.maxHz;
}
