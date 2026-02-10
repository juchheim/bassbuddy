import type { BassRun } from "@/lib/types";
import { percentDiff } from "@/lib/utils/math";

export interface CompareDecision {
  winnerId: string | "tie";
  reason: string;
}

export function compareRuns(runA: BassRun, runB: BassRun): CompareDecision {
  if (runA.score < runB.score && percentDiff(runA.score, runB.score) > 0.05) {
    return {
      winnerId: runA.id,
      reason: `${runA.label ?? "Run A"} has a lower smoothness score.`
    };
  }

  if (runB.score < runA.score && percentDiff(runA.score, runB.score) > 0.05) {
    return {
      winnerId: runB.id,
      reason: `${runB.label ?? "Run B"} has a lower smoothness score.`
    };
  }

  if (runA.highlights.deepDipCount < runB.highlights.deepDipCount) {
    return {
      winnerId: runA.id,
      reason: `${runA.label ?? "Run A"} has fewer deep dips below -10 dB.`
    };
  }

  if (runB.highlights.deepDipCount < runA.highlights.deepDipCount) {
    return {
      winnerId: runB.id,
      reason: `${runB.label ?? "Run B"} has fewer deep dips below -10 dB.`
    };
  }

  if (runA.highlights.maxPeakDb < runB.highlights.maxPeakDb) {
    return {
      winnerId: runA.id,
      reason: `${runA.label ?? "Run A"} has the smaller worst boom peak.`
    };
  }

  if (runB.highlights.maxPeakDb < runA.highlights.maxPeakDb) {
    return {
      winnerId: runB.id,
      reason: `${runB.label ?? "Run B"} has the smaller worst boom peak.`
    };
  }

  return {
    winnerId: "tie",
    reason: "Both runs are effectively tied by score, deep-dip count, and max peak."
  };
}
