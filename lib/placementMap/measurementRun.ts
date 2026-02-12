import type { AnalyzeRunOutput } from "@/lib/audio/analyzeRun";
import { DEFAULT_PLACEMENT_BANDS } from "@/lib/placementMap/bands";
import { assessPlacementQuality } from "@/lib/placementMap/quality";
import { scorePlacementResponse } from "@/lib/placementMap/scoring";
import type { SaveMeasurementRunInput } from "@/lib/placementMap/store";

export interface BuildPlacementMeasurementRunInput {
  pointId: string;
  sourceRunId: string;
  analysis: AnalyzeRunOutput;
  samples: Float32Array;
  sampleRate: number;
  livePeak: number;
  liveRms: number;
}

export interface BuildPlacementMeasurementRunOutput {
  measurementRun: SaveMeasurementRunInput;
  qualityNote: string | null;
}

export function buildPlacementMeasurementRun(
  input: BuildPlacementMeasurementRunInput
): BuildPlacementMeasurementRunOutput {
  const toneFrequencies = input.analysis.measurements.map((point) => point.freqHz);
  const toneLevelsDb = input.analysis.measurements.map((point) => point.levelRelDb);
  const scoring = scorePlacementResponse(toneFrequencies, toneLevelsDb, DEFAULT_PLACEMENT_BANDS);
  const quality = assessPlacementQuality(input.analysis, input.samples, input.sampleRate, input.livePeak, input.liveRms);

  const qualityIssues: string[] = [];

  if (quality.qualityFlags.clipped) {
    qualityIssues.push("clipping");
  }

  if (quality.qualityFlags.noisy) {
    qualityIssues.push("background noise");
  }

  if (quality.qualityFlags.unstable) {
    qualityIssues.push("unstable tone hold");
  }

  const qualityNote =
    qualityIssues.length > 0 ? `Measurement flagged: ${qualityIssues.join(", ")}. Consider retaking this point.` : null;

  return {
    measurementRun: {
      pointId: input.pointId,
      sourceRunId: input.sourceRunId,
      createdAt: new Date().toISOString(),
      toneFrequencies,
      toneLevelsDb,
      bandScores: scoring.bandScores,
      overallScore: scoring.overall.score,
      qualityFlags: quality.qualityFlags
    },
    qualityNote
  };
}
