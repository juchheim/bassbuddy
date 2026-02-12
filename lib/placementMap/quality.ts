import type { AnalyzeRunOutput } from "@/lib/audio/analyzeRun";
import { goertzelDb } from "@/lib/audio/goertzel";
import type { ToneSegment } from "@/lib/constants/testTrack";
import type { MeasurementQualityFlags } from "@/lib/placementMap/types";

export interface PlacementQualityAssessment {
  qualityFlags: MeasurementQualityFlags;
  snrEstimateDb: number;
  averagePassSpreadDb: number;
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function measureSegmentLevel(samples: Float32Array, sampleRate: number, segment: ToneSegment): number {
  const start = Math.max(0, Math.floor(segment.analysisStartSec * sampleRate));
  const end = Math.min(samples.length, Math.floor(segment.analysisEndSec * sampleRate));

  if (end <= start) {
    return -120;
  }

  const frame = samples.subarray(start, end);

  if (!frame.length) {
    return -120;
  }

  return goertzelDb(frame, sampleRate, segment.freqHz);
}

function estimateUnstableFlag(samples: Float32Array, sampleRate: number, schedule: ToneSegment[]): { unstable: boolean; averageSpreadDb: number } {
  const passLevelsByFrequency = new Map<number, number[]>();

  for (const segment of schedule) {
    const level = measureSegmentLevel(samples, sampleRate, segment);
    const levels = passLevelsByFrequency.get(segment.freqHz) ?? [];
    levels.push(level);
    passLevelsByFrequency.set(segment.freqHz, levels);
  }

  const spreads: number[] = [];

  for (const levels of passLevelsByFrequency.values()) {
    if (levels.length < 2) {
      continue;
    }

    const max = Math.max(...levels);
    const min = Math.min(...levels);
    spreads.push(max - min);
  }

  const averageSpreadDb = average(spreads);
  const maxSpreadDb = spreads.length ? Math.max(...spreads) : 0;

  return {
    unstable: averageSpreadDb > 2.75 || maxSpreadDb > 4,
    averageSpreadDb
  };
}

export function assessPlacementQuality(
  analysis: AnalyzeRunOutput,
  samples: Float32Array,
  sampleRate: number,
  livePeak: number,
  liveRms: number
): PlacementQualityAssessment {
  const clipped = analysis.clippingLikely || livePeak > 0.98;
  const snrEstimateDb = analysis.beepToneLevelDb - analysis.overallRmsDbfs;
  const noisy = analysis.tooQuietLikely || liveRms < 0.003 || snrEstimateDb < 18;
  const unstableAssessment = estimateUnstableFlag(samples, sampleRate, analysis.schedule);

  return {
    qualityFlags: {
      clipped: clipped || undefined,
      noisy: noisy || undefined,
      unstable: unstableAssessment.unstable || undefined
    },
    snrEstimateDb,
    averagePassSpreadDb: unstableAssessment.averageSpreadDb
  };
}
