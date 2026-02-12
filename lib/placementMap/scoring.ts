import { DEFAULT_PLACEMENT_BANDS, isFrequencyInBand, type PlacementBand } from "@/lib/placementMap/bands";

export interface ScoreComponents {
  smoothnessPenalty: number;
  nullPenalty: number;
  peakPenalty: number;
}

export interface ScoreBreakdown extends ScoreComponents {
  score: number;
}

export interface PlacementScoreResult {
  overall: ScoreBreakdown;
  bandScores: Record<string, number>;
}

interface FrequencyPoint {
  frequencyHz: number;
  levelDb: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toPoints(toneFrequencies: number[], toneLevelsDb: number[]): FrequencyPoint[] {
  const points: FrequencyPoint[] = [];

  for (let index = 0; index < Math.min(toneFrequencies.length, toneLevelsDb.length); index += 1) {
    points.push({
      frequencyHz: toneFrequencies[index] ?? 0,
      levelDb: toneLevelsDb[index] ?? 0
    });
  }

  return points;
}

function computeScoreFromLevels(levelsDb: number[]): ScoreBreakdown {
  if (!levelsDb.length) {
    return {
      score: 0,
      smoothnessPenalty: 0,
      nullPenalty: 0,
      peakPenalty: 0
    };
  }

  const adjacentDiffs: number[] = [];

  for (let index = 1; index < levelsDb.length; index += 1) {
    const previous = levelsDb[index - 1] ?? 0;
    const current = levelsDb[index] ?? 0;
    adjacentDiffs.push(Math.abs(current - previous));
  }

  // Why this works:
  // 1) smoothness tracks rapid seat-response swings between adjacent tones.
  // 2) nulls are weighted heavier because deep cancellations are harder to fix than peaks.
  // 3) peaks still matter, but with lower weight because they are often easier to tame.
  const smoothnessPenalty = average(adjacentDiffs) * 10;
  const nullPenalty = levelsDb.reduce((sum, levelDb) => {
    const depthBelowTarget = Math.max(0, -levelDb - 4);
    return sum + depthBelowTarget ** 1.35 * 5;
  }, 0);
  const peakPenalty = levelsDb.reduce((sum, levelDb) => {
    const heightAboveTarget = Math.max(0, levelDb - 5);
    return sum + heightAboveTarget ** 1.25 * 3;
  }, 0);

  const weightedPenalty = smoothnessPenalty * 0.45 + nullPenalty * 0.4 + peakPenalty * 0.15;
  const score = clamp(100 - weightedPenalty, 0, 100);

  return {
    score,
    smoothnessPenalty,
    nullPenalty,
    peakPenalty
  };
}

export function scorePlacementResponse(
  toneFrequencies: number[],
  toneLevelsDb: number[],
  bands: PlacementBand[] = DEFAULT_PLACEMENT_BANDS
): PlacementScoreResult {
  const points = toPoints(toneFrequencies, toneLevelsDb);
  const overall = computeScoreFromLevels(points.map((point) => point.levelDb));

  const bandScores = bands.reduce<Record<string, number>>((output, band, bandIndex) => {
    const bandLevels = points
      .filter((point) => isFrequencyInBand(point.frequencyHz, band, bandIndex))
      .map((point) => point.levelDb);

    output[band.key] = computeScoreFromLevels(bandLevels).score;
    return output;
  }, {});

  return {
    overall,
    bandScores
  };
}
