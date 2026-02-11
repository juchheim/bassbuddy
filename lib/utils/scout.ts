import { parseScoutLabel } from "@/lib/constants/scout";
import type { BassRun } from "@/lib/types";

export interface ScoutCandidate {
  label: string;
  index: number;
  run: BassRun;
  rank: number;
}

export interface ScoutRanking {
  candidates: ScoutCandidate[];
  topTwo: [ScoutCandidate, ScoutCandidate] | null;
}

function newestRun(runs: BassRun[]): BassRun {
  return [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function compareCandidates(a: ScoutCandidate, b: ScoutCandidate): number {
  if (a.run.score !== b.run.score) {
    return a.run.score - b.run.score;
  }

  if (a.run.highlights.deepDipCount !== b.run.highlights.deepDipCount) {
    return a.run.highlights.deepDipCount - b.run.highlights.deepDipCount;
  }

  if (a.run.highlights.maxPeakDb !== b.run.highlights.maxPeakDb) {
    return a.run.highlights.maxPeakDb - b.run.highlights.maxPeakDb;
  }

  return a.index - b.index;
}

export function buildScoutRanking(runs: BassRun[]): ScoutRanking {
  const grouped = new Map<number, BassRun[]>();

  for (const run of runs) {
    const index = parseScoutLabel(run.label);

    if (index === null) {
      continue;
    }

    const existing = grouped.get(index) ?? [];
    existing.push(run);
    grouped.set(index, existing);
  }

  const candidates = Array.from(grouped.entries())
    .map(([index, groupedRuns]) => {
      const run = newestRun(groupedRuns);

      return {
        label: run.label ?? `Scout Location ${index}`,
        index,
        run,
        rank: 0
      } satisfies ScoutCandidate;
    })
    .sort(compareCandidates)
    .map((candidate, rankIndex) => ({
      ...candidate,
      rank: rankIndex + 1
    }));

  const topTwo: [ScoutCandidate, ScoutCandidate] | null =
    candidates.length >= 2 ? [candidates[0], candidates[1]] : null;

  return {
    candidates,
    topTwo
  };
}

export function scoutPromotionLabels(topTwo: [ScoutCandidate, ScoutCandidate]): { A: string; B: string } {
  return {
    A: `Placement A (${topTwo[0].label})`,
    B: `Placement B (${topTwo[1].label})`
  };
}
