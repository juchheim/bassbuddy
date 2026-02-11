import { calculateSmoothness } from "@/lib/audio/analyzeRun";
import type { BassRun, Confidence, FrequencyMeasurement, RunMode, RunQuality, RunQualityTier } from "@/lib/types";
import { mean, median } from "@/lib/utils/math";

export interface RunGroupOption {
  label: string;
  runs: BassRun[];
}

export interface RepeatabilityProfile {
  label: string;
  sourceRuns: BassRun[];
  aggregateRun: BassRun;
  scoreSpread: number;
  curveNoiseFloorDb: number;
  qualitySummary: {
    averageScore: number;
    blockingRuns: number;
  };
}

export interface RepeatabilityDecision {
  canDeclareWinner: boolean;
  reason: string;
  scoreDelta: number;
  scoreNoiseFloor: number;
}

function qualityTierFromScore(score: number): RunQualityTier {
  if (score >= 85) {
    return "excellent";
  }

  if (score >= 65) {
    return "usable";
  }

  return "poor";
}

function summarizeGroupQuality(runs: BassRun[]): RunQuality {
  const scores = runs.map((run) => run.quality?.score ?? 70);
  const averageScore = Math.round(mean(scores));
  const blockingRuns = runs.filter((run) => run.quality?.blocking).length;
  const tier = qualityTierFromScore(averageScore);

  const issues: string[] = [];

  if (blockingRuns > 0) {
    issues.push(`${blockingRuns} run(s) in this group failed quality checks.`);
  }

  if (runs.some((run) => !run.quality)) {
    issues.push("Group includes legacy run(s) without quality metadata.");
  }

  return {
    score: averageScore,
    tier,
    blocking: blockingRuns > 0 || tier === "poor",
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

function confidenceFromRuns(runs: BassRun[]): Confidence {
  if (runs.every((run) => run.confidence === "high")) {
    return "high";
  }

  if (runs.some((run) => run.confidence === "low")) {
    return "low";
  }

  return "medium";
}

export function groupRunsByLabel(runs: BassRun[]): RunGroupOption[] {
  const map = new Map<string, BassRun[]>();

  for (const run of runs) {
    const key = run.label?.trim() || "Unlabeled";
    const existing = map.get(key) ?? [];
    existing.push(run);
    map.set(key, existing);
  }

  return Array.from(map.entries())
    .map(([label, groupedRuns]) => ({
      label,
      runs: groupedRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }))
    .sort((a, b) => b.runs.length - a.runs.length || a.label.localeCompare(b.label));
}

function pairwiseCurveDiff(runA: BassRun, runB: BassRun): number {
  const diffs: number[] = [];

  for (const pointA of runA.measurements) {
    const pointB = runB.measurements.find((measurement) => measurement.freqHz === pointA.freqHz);

    if (!pointB) {
      continue;
    }

    diffs.push(Math.abs(pointA.levelRelDb - pointB.levelRelDb));
  }

  if (!diffs.length) {
    return 0;
  }

  return mean(diffs);
}

export function buildRepeatabilityProfile(
  label: string,
  runs: BassRun[],
  maxRuns = 3
): RepeatabilityProfile | null {
  const selectedRuns = runs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, maxRuns);

  if (selectedRuns.length < 2) {
    return null;
  }

  const freqs = Array.from(
    new Set(selectedRuns.flatMap((run) => run.measurements.map((measurement) => measurement.freqHz)))
  ).sort((a, b) => a - b);

  const measurements: FrequencyMeasurement[] = freqs.map((freqHz) => {
    const relValues: number[] = [];
    const rawValues: number[] = [];

    for (const run of selectedRuns) {
      const point = run.measurements.find((measurement) => measurement.freqHz === freqHz);
      if (!point) {
        continue;
      }

      relValues.push(point.levelRelDb);
      rawValues.push(point.levelRaw);
    }

    return {
      freqHz,
      levelRelDb: relValues.length ? median(relValues) : 0,
      levelRaw: rawValues.length ? median(rawValues) : -120
    };
  });

  const { score, highlights } = calculateSmoothness(measurements);

  const quality = summarizeGroupQuality(selectedRuns);
  const scoreSpread =
    selectedRuns.length > 1
      ? Math.max(...selectedRuns.map((run) => run.score)) - Math.min(...selectedRuns.map((run) => run.score))
      : 0;

  const pairwiseDiffs: number[] = [];

  for (let i = 0; i < selectedRuns.length; i += 1) {
    for (let j = i + 1; j < selectedRuns.length; j += 1) {
      pairwiseDiffs.push(pairwiseCurveDiff(selectedRuns[i], selectedRuns[j]));
    }
  }

  const curveNoiseFloorDb = pairwiseDiffs.length ? median(pairwiseDiffs) : 0;

  const aggregateRun: BassRun = {
    id: `repeatability-${label}`,
    createdAt: selectedRuns[0].createdAt,
    mode: selectedRuns[0].mode,
    label,
    deviceInfo: selectedRuns[0].deviceInfo,
    micSettings: selectedRuns[0].micSettings,
    sampleRate: selectedRuns[0].sampleRate,
    beepDetected: selectedRuns.every((run) => run.beepDetected),
    confidence: confidenceFromRuns(selectedRuns),
    measurements,
    score,
    highlights,
    quality,
    medianRawLevelDb: median(selectedRuns.map((run) => run.medianRawLevelDb ?? median(run.measurements.map((point) => point.levelRaw)))),
    beepToneLevelDb: median(selectedRuns.map((run) => run.beepToneLevelDb ?? -60)),
    volumeAnchorDb: median(selectedRuns.map((run) => fallbackVolumeAnchor(run)))
  };

  return {
    label,
    sourceRuns: selectedRuns,
    aggregateRun,
    scoreSpread,
    curveNoiseFloorDb,
    qualitySummary: {
      averageScore: quality.score,
      blockingRuns: selectedRuns.filter((run) => run.quality?.blocking).length
    }
  };
}

export function evaluateRepeatabilityDecision(profileA: RepeatabilityProfile, profileB: RepeatabilityProfile): RepeatabilityDecision {
  const scoreDelta = Math.abs(profileA.aggregateRun.score - profileB.aggregateRun.score);
  const scoreNoiseFloor = Math.max(profileA.scoreSpread, profileB.scoreSpread, 3);

  if (scoreDelta <= scoreNoiseFloor) {
    return {
      canDeclareWinner: false,
      reason: `Score difference (${scoreDelta.toFixed(1)}) is within repeatability floor (${scoreNoiseFloor.toFixed(1)}).`,
      scoreDelta,
      scoreNoiseFloor
    };
  }

  return {
    canDeclareWinner: true,
    reason: `Score difference (${scoreDelta.toFixed(1)}) exceeds repeatability floor (${scoreNoiseFloor.toFixed(1)}).`,
    scoreDelta,
    scoreNoiseFloor
  };
}

export function curveDeltaBetweenRuns(runA: BassRun, runB: BassRun): number {
  return pairwiseCurveDiff(runA, runB);
}

export function isRepeatabilityModeRecommended(mode: RunMode): boolean {
  return mode === "ab" || mode === "phase";
}
