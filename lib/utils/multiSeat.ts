import { calculateSmoothness } from "@/lib/audio/analyzeRun";
import { MULTI_SEAT_ORDER, multiSeatLabel, seatDisplayName, type MultiSeatPlacement, type MultiSeatPosition } from "@/lib/constants/multiSeat";
import type { BassRun, RunQuality } from "@/lib/types";
import { mean } from "@/lib/utils/math";
import { evaluateCompareReadiness } from "@/lib/utils/runQuality";

const SEAT_WEIGHTS: Record<MultiSeatPosition, number> = {
  center: 0.5,
  left: 0.25,
  right: 0.25
};

export interface MultiSeatPlacementRuns {
  center?: BassRun;
  left?: BassRun;
  right?: BassRun;
}

export interface MultiSeatRunSet {
  placementA: MultiSeatPlacementRuns;
  placementB: MultiSeatPlacementRuns;
}

export interface MultiSeatPlacementSummary {
  placement: MultiSeatPlacement;
  runs: MultiSeatPlacementRuns;
  missingSeats: MultiSeatPosition[];
  weightedSmoothness: number;
  seatSpread: number;
  weightedDeepDips: number;
  compromiseScore: number;
  aggregateRun: BassRun | null;
}

export interface MultiSeatDecision {
  canDeclareWinner: boolean;
  winner: "A" | "B" | "tie";
  reason: string;
  blockers: string[];
  warnings: string[];
  placementA: MultiSeatPlacementSummary;
  placementB: MultiSeatPlacementSummary;
  scoreDelta: number;
  scoreFloor: number;
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const total = values.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return total / totalWeight;
}

function stdDev(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function qualityFromRuns(runs: BassRun[]): RunQuality {
  const scores = runs.map((run) => run.quality?.score ?? 70);
  const average = Math.round(mean(scores));
  const blocking = runs.some((run) => run.quality?.blocking);

  return {
    score: average,
    tier: average >= 85 ? "excellent" : average >= 65 ? "usable" : "poor",
    blocking,
    issues: blocking ? ["One or more seat measurements failed quality checks."] : []
  };
}

function latestRunByLabel(runs: BassRun[], label: string): BassRun | undefined {
  return runs.find((run) => run.label === label);
}

function buildPlacementRuns(runs: BassRun[], placement: MultiSeatPlacement): MultiSeatPlacementRuns {
  return {
    center: latestRunByLabel(runs, multiSeatLabel(placement, "center")),
    left: latestRunByLabel(runs, multiSeatLabel(placement, "left")),
    right: latestRunByLabel(runs, multiSeatLabel(placement, "right"))
  };
}

export function buildMultiSeatRunSet(runs: BassRun[]): MultiSeatRunSet {
  return {
    placementA: buildPlacementRuns(runs, "A"),
    placementB: buildPlacementRuns(runs, "B")
  };
}

export function isPlacementComplete(runs: MultiSeatPlacementRuns): boolean {
  return MULTI_SEAT_ORDER.every((seat) => Boolean(runs[seat]));
}

function buildAggregateRun(placement: MultiSeatPlacement, runs: MultiSeatPlacementRuns): BassRun | null {
  const available = MULTI_SEAT_ORDER.map((seat) => ({ seat, run: runs[seat] })).filter(
    (entry): entry is { seat: MultiSeatPosition; run: BassRun } => Boolean(entry.run)
  );

  if (available.length < 3) {
    return null;
  }

  const freqs = Array.from(
    new Set(
      available.flatMap((entry) => entry.run.measurements.map((measurement) => measurement.freqHz))
    )
  ).sort((a, b) => a - b);

  const measurements = freqs.map((freqHz) => {
    const relValues = available
      .map((entry) => {
        const point = entry.run.measurements.find((measurement) => measurement.freqHz === freqHz);
        if (!point) {
          return null;
        }

        return {
          value: point.levelRelDb,
          weight: SEAT_WEIGHTS[entry.seat]
        };
      })
      .filter((entry): entry is { value: number; weight: number } => Boolean(entry));

    const rawValues = available
      .map((entry) => {
        const point = entry.run.measurements.find((measurement) => measurement.freqHz === freqHz);
        if (!point) {
          return null;
        }

        return {
          value: point.levelRaw,
          weight: SEAT_WEIGHTS[entry.seat]
        };
      })
      .filter((entry): entry is { value: number; weight: number } => Boolean(entry));

    return {
      freqHz,
      levelRelDb: weightedAverage(relValues),
      levelRaw: weightedAverage(rawValues)
    };
  });

  const { score, highlights } = calculateSmoothness(measurements);
  const sourceRuns = available.map((entry) => entry.run);

  return {
    id: `multiseat-${placement}`,
    createdAt: sourceRuns[0]?.createdAt ?? new Date().toISOString(),
    mode: "multiseat",
    label: `Placement ${placement} - Compromise Aggregate`,
    deviceInfo: sourceRuns[0].deviceInfo,
    micSettings: sourceRuns[0].micSettings,
    sampleRate: sourceRuns[0].sampleRate,
    beepDetected: sourceRuns.every((run) => run.beepDetected),
    confidence: sourceRuns.some((run) => run.confidence === "low")
      ? "low"
      : sourceRuns.every((run) => run.confidence === "high")
      ? "high"
      : "medium",
    measurements,
    score,
    highlights,
    quality: qualityFromRuns(sourceRuns),
    medianRawLevelDb: weightedAverage(
      available.map((entry) => ({
        value: entry.run.medianRawLevelDb ?? entry.run.measurements.reduce((sum, point) => sum + point.levelRaw, 0) / entry.run.measurements.length,
        weight: SEAT_WEIGHTS[entry.seat]
      }))
    ),
    beepToneLevelDb: weightedAverage(
      available.map((entry) => ({
        value: entry.run.beepToneLevelDb ?? -60,
        weight: SEAT_WEIGHTS[entry.seat]
      }))
    ),
    volumeAnchorDb: weightedAverage(
      available.map((entry) => ({
        value: entry.run.volumeAnchorDb ?? entry.run.medianRawLevelDb ?? -60,
        weight: SEAT_WEIGHTS[entry.seat]
      }))
    )
  };
}

export function summarizePlacement(placement: MultiSeatPlacement, runs: MultiSeatPlacementRuns): MultiSeatPlacementSummary {
  const missingSeats = MULTI_SEAT_ORDER.filter((seat) => !runs[seat]);
  const aggregateRun = buildAggregateRun(placement, runs);

  if (!aggregateRun) {
    return {
      placement,
      runs,
      missingSeats,
      weightedSmoothness: Number.POSITIVE_INFINITY,
      seatSpread: Number.POSITIVE_INFINITY,
      weightedDeepDips: Number.POSITIVE_INFINITY,
      compromiseScore: Number.POSITIVE_INFINITY,
      aggregateRun: null
    };
  }

  const seatScores = MULTI_SEAT_ORDER.map((seat) => runs[seat]?.score ?? aggregateRun.score);
  const weightedSmoothness = weightedAverage(
    MULTI_SEAT_ORDER.map((seat) => ({
      value: runs[seat]?.score ?? aggregateRun.score,
      weight: SEAT_WEIGHTS[seat]
    }))
  );

  const weightedDeepDips = weightedAverage(
    MULTI_SEAT_ORDER.map((seat) => ({
      value: runs[seat]?.highlights.deepDipCount ?? aggregateRun.highlights.deepDipCount,
      weight: SEAT_WEIGHTS[seat]
    }))
  );

  const seatSpread = stdDev(seatScores);
  const compromiseScore = weightedSmoothness + seatSpread * 0.8 + weightedDeepDips * 1.5;

  return {
    placement,
    runs,
    missingSeats,
    weightedSmoothness,
    seatSpread,
    weightedDeepDips,
    compromiseScore,
    aggregateRun
  };
}

function compareSeatPair(seat: MultiSeatPosition, runA?: BassRun, runB?: BassRun): { blockers: string[]; warnings: string[] } {
  if (!runA || !runB) {
    return { blockers: [], warnings: [] };
  }

  const readiness = evaluateCompareReadiness(runA, runB);
  const seatName = seatDisplayName(seat);

  return {
    blockers: readiness.blockers.map((entry) => `${seatName}: ${entry}`),
    warnings: readiness.warnings.map((entry) => `${seatName}: ${entry}`)
  };
}

export function evaluateMultiSeatDecision(runs: BassRun[]): MultiSeatDecision {
  const set = buildMultiSeatRunSet(runs);
  const placementA = summarizePlacement("A", set.placementA);
  const placementB = summarizePlacement("B", set.placementB);

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!placementA.aggregateRun) {
    blockers.push(`Placement A is missing seats: ${placementA.missingSeats.map(seatDisplayName).join(", ")}.`);
  }

  if (!placementB.aggregateRun) {
    blockers.push(`Placement B is missing seats: ${placementB.missingSeats.map(seatDisplayName).join(", ")}.`);
  }

  for (const seat of MULTI_SEAT_ORDER) {
    const pairOutcome = compareSeatPair(seat, set.placementA[seat], set.placementB[seat]);
    blockers.push(...pairOutcome.blockers);
    warnings.push(...pairOutcome.warnings);
  }

  const scoreDelta = Math.abs(placementA.compromiseScore - placementB.compromiseScore);
  const scoreFloor = Math.max(placementA.seatSpread, placementB.seatSpread, 2);

  let winner: MultiSeatDecision["winner"] = "tie";
  let reason = "Compromise tie across seats.";

  if (!blockers.length) {
    if (scoreDelta <= scoreFloor) {
      winner = "tie";
      reason = `Compromise scores are within seat-variance floor (${scoreFloor.toFixed(1)}).`;
    } else if (placementA.compromiseScore < placementB.compromiseScore) {
      winner = "A";
      reason = "Placement A has lower weighted smoothness + less seat imbalance.";
    } else {
      winner = "B";
      reason = "Placement B has lower weighted smoothness + less seat imbalance.";
    }
  }

  return {
    canDeclareWinner: blockers.length === 0 && scoreDelta > scoreFloor,
    winner,
    reason,
    blockers,
    warnings,
    placementA,
    placementB,
    scoreDelta,
    scoreFloor
  };
}
