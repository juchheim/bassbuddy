import type { FrequencyMeasurement } from "@/lib/types";

export interface ProblemBand {
  type: "peak" | "dip";
  startHz: number;
  endHz: number;
  worstHz: number;
  worstDb: number;
}

export function verdictForScore(score: number): "Good" | "OK" | "Rough" {
  if (score < 20) {
    return "Good";
  }

  if (score < 80) {
    return "OK";
  }

  return "Rough";
}

export function findProblemBands(measurements: FrequencyMeasurement[]): ProblemBand[] {
  const output: ProblemBand[] = [];
  let current: ProblemBand | null = null;

  for (const point of measurements) {
    const isPeak = point.levelRelDb > 6;
    const isDip = point.levelRelDb < -10;

    if (!isPeak && !isDip) {
      if (current) {
        output.push(current);
      }
      current = null;
      continue;
    }

    const type: ProblemBand["type"] = isPeak ? "peak" : "dip";

    if (!current || current.type !== type) {
      if (current) {
        output.push(current);
      }

      current = {
        type,
        startHz: point.freqHz,
        endHz: point.freqHz,
        worstHz: point.freqHz,
        worstDb: point.levelRelDb
      };
      continue;
    }

    current.endHz = point.freqHz;

    if (type === "peak" && point.levelRelDb > current.worstDb) {
      current.worstDb = point.levelRelDb;
      current.worstHz = point.freqHz;
    }

    if (type === "dip" && point.levelRelDb < current.worstDb) {
      current.worstDb = point.levelRelDb;
      current.worstHz = point.freqHz;
    }
  }

  if (current) {
    output.push(current);
  }

  return output;
}
