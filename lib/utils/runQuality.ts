import type { BassRun, Confidence, MicProcessingRisk, RunQuality, RunQualityTier } from "@/lib/types";
import { clamp, median } from "@/lib/utils/math";

interface RunQualityInput {
  confidence: Confidence;
  beepDetected: boolean;
  clippingLikely: boolean;
  tooQuietLikely: boolean;
  micProcessingRisk: MicProcessingRisk;
  peakDbfs: number;
  overallRmsDbfs: number;
  beepToneLevelDb: number;
}

export interface RepeatabilitySignal {
  meanAbsDiffDb: number;
  maxAbsDiffDb: number;
  verdict: "high" | "moderate" | "low";
}

export interface CompareReadiness {
  canDeclareWinner: boolean;
  blockers: string[];
  warnings: string[];
  volumeDeltaDb: number | null;
  repeatability: RepeatabilitySignal | null;
}

function qualityTier(score: number): RunQualityTier {
  if (score >= 85) {
    return "excellent";
  }

  if (score >= 65) {
    return "usable";
  }

  return "poor";
}

export function evaluateRunQuality(input: RunQualityInput): RunQuality {
  let score = 100;
  const issues: string[] = [];
  let blocking = false;

  if (!input.beepDetected) {
    score -= 35;
    blocking = true;
    issues.push("Sync beep was not detected reliably.");
  }

  if (input.confidence === "low") {
    score -= 20;
    issues.push("Timing confidence is low.");
  } else if (input.confidence === "medium") {
    score -= 10;
    issues.push("Timing confidence is medium.");
  }

  if (input.clippingLikely) {
    score -= 25;
    blocking = true;
    issues.push("Clipping likely occurred during recording.");
  }

  if (input.tooQuietLikely) {
    score -= 20;
    issues.push("Signal level was very quiet.");
  }

  if (input.micProcessingRisk === "high") {
    score -= 15;
    issues.push("Mic processing appears enabled (AGC/NS/EC). Results may be skewed.");
  } else if (input.micProcessingRisk === "unknown") {
    score -= 7;
    issues.push("Mic processing state could not be fully verified.");
  }

  if (input.beepToneLevelDb < -58) {
    score -= 8;
    issues.push("Sync beep level was weak.");
  }

  if (input.peakDbfs > -0.4) {
    score -= 8;
    issues.push("Signal peak was near digital full scale.");
  }

  if (input.overallRmsDbfs < -60) {
    score -= 12;
    issues.push("Overall RMS level was very low.");
  }

  score = clamp(score, 0, 100);
  const tier = qualityTier(score);

  if (tier === "poor") {
    blocking = true;
  }

  return {
    score,
    tier,
    blocking,
    issues
  };
}

function fallbackVolumeAnchor(run: BassRun): number {
  if (typeof run.volumeAnchorDb === "number") {
    return run.volumeAnchorDb;
  }

  if (typeof run.medianRawLevelDb === "number") {
    return run.medianRawLevelDb;
  }

  return median(run.measurements.map((measurement) => measurement.levelRaw));
}

function runName(run: BassRun, fallback: string): string {
  return run.label?.trim() ? run.label : fallback;
}

export function detectVolumeMismatch(runA: BassRun, runB: BassRun): { deltaDb: number; severity: "ok" | "warn" | "block" } {
  const deltaDb = Math.abs(fallbackVolumeAnchor(runA) - fallbackVolumeAnchor(runB));

  if (deltaDb > 4) {
    return { deltaDb, severity: "block" };
  }

  if (deltaDb > 2) {
    return { deltaDb, severity: "warn" };
  }

  return { deltaDb, severity: "ok" };
}

export function computeRepeatabilitySignal(runA: BassRun, runB: BassRun): RepeatabilitySignal | null {
  const values: number[] = [];

  for (const pointA of runA.measurements) {
    const pointB = runB.measurements.find((measurement) => measurement.freqHz === pointA.freqHz);

    if (!pointB) {
      continue;
    }

    values.push(Math.abs(pointA.levelRelDb - pointB.levelRelDb));
  }

  if (!values.length) {
    return null;
  }

  const meanAbsDiffDb = values.reduce((sum, value) => sum + value, 0) / values.length;
  const maxAbsDiffDb = Math.max(...values);

  let verdict: RepeatabilitySignal["verdict"] = "low";

  if (meanAbsDiffDb <= 1.5 && maxAbsDiffDb <= 3) {
    verdict = "high";
  } else if (meanAbsDiffDb <= 3 && maxAbsDiffDb <= 6) {
    verdict = "moderate";
  }

  return {
    meanAbsDiffDb,
    maxAbsDiffDb,
    verdict
  };
}

export function evaluateCompareReadiness(runA: BassRun, runB: BassRun): CompareReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const nameA = runName(runA, "Run A");
  const nameB = runName(runB, "Run B");

  if (runA.quality?.blocking) {
    blockers.push(`${nameA} has poor measurement quality (${runA.quality.score}/100).`);
  } else if (!runA.quality) {
    warnings.push(`${nameA} is a legacy run without quality metadata.`);
  } else if (runA.quality.tier === "usable") {
    warnings.push(`${nameA} quality is usable but not strong (${runA.quality.score}/100).`);
  }

  if (runB.quality?.blocking) {
    blockers.push(`${nameB} has poor measurement quality (${runB.quality.score}/100).`);
  } else if (!runB.quality) {
    warnings.push(`${nameB} is a legacy run without quality metadata.`);
  } else if (runB.quality.tier === "usable") {
    warnings.push(`${nameB} quality is usable but not strong (${runB.quality.score}/100).`);
  }

  const volume = detectVolumeMismatch(runA, runB);

  if (volume.severity === "block") {
    blockers.push(`Playback level mismatch likely (${volume.deltaDb.toFixed(1)} dB difference). Re-run at matched volume.`);
  } else if (volume.severity === "warn") {
    warnings.push(`Playback level mismatch possible (${volume.deltaDb.toFixed(1)} dB difference).`);
  }

  const repeatability = computeRepeatabilitySignal(runA, runB);

  return {
    canDeclareWinner: blockers.length === 0,
    blockers,
    warnings,
    volumeDeltaDb: volume.deltaDb,
    repeatability
  };
}
