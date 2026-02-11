import { describe, expect, it } from "vitest";
import { multiSeatLabel } from "@/lib/constants/multiSeat";
import type { BassRun } from "@/lib/types";
import { buildMultiSeatRunSet, evaluateMultiSeatDecision, isPlacementComplete } from "@/lib/utils/multiSeat";

function makeRun(id: string, label: string, score: number, rel: number[]): BassRun {
  const freqs = [25, 40, 63, 80];

  return {
    id,
    createdAt: new Date(Date.now() + Number(id.replace(/\D/g, "") || 0) * 1000).toISOString(),
    mode: "multiseat",
    label,
    deviceInfo: { userAgent: "test", platform: "test" },
    micSettings: {
      requested: {},
      supported: {},
      settings: {},
      capabilities: {},
      processingRisk: "low",
      warnings: []
    },
    sampleRate: 48_000,
    beepDetected: true,
    confidence: "high",
    measurements: freqs.map((freq, index) => ({
      freqHz: freq,
      levelRaw: -30 + (rel[index] ?? 0),
      levelRelDb: rel[index] ?? 0
    })),
    score,
    highlights: {
      worstPeakHz: 63,
      worstDipHz: 25,
      maxPeakDb: Math.max(...rel),
      maxDipDb: Math.min(...rel),
      deepDipCount: rel.filter((value) => value < -10).length,
      bigPeakCount: rel.filter((value) => value > 6).length
    },
    quality: {
      score: 90,
      tier: "excellent",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -24,
    volumeAnchorDb: -30
  };
}

describe("buildMultiSeatRunSet", () => {
  it("maps latest runs to seat labels", () => {
    const runs = [
      makeRun("1", multiSeatLabel("A", "center"), 10, [0, 0, 0, 0]),
      makeRun("2", multiSeatLabel("A", "left"), 11, [0, 1, 0, 0]),
      makeRun("3", multiSeatLabel("A", "right"), 12, [0, 0, 1, 0]),
      makeRun("4", multiSeatLabel("B", "center"), 13, [0, 0, 0, 1]),
      makeRun("5", multiSeatLabel("B", "left"), 14, [0, 0, 0, 0.5]),
      makeRun("6", multiSeatLabel("B", "right"), 15, [0, 0, 0, 0.25])
    ];

    const set = buildMultiSeatRunSet(runs);

    expect(isPlacementComplete(set.placementA)).toBe(true);
    expect(isPlacementComplete(set.placementB)).toBe(true);
  });
});

describe("evaluateMultiSeatDecision", () => {
  it("blocks decision when seats are missing", () => {
    const runs = [
      makeRun("1", multiSeatLabel("A", "center"), 10, [0, 0, 0, 0]),
      makeRun("2", multiSeatLabel("B", "center"), 11, [0, 0, 0, 0])
    ];

    const result = evaluateMultiSeatDecision(runs);

    expect(result.canDeclareWinner).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("declares winner when one placement has clearly better compromise", () => {
    const runs = [
      makeRun("1", multiSeatLabel("A", "center"), 10, [0, 0, 0, 0]),
      makeRun("2", multiSeatLabel("A", "left"), 12, [0, 1, 0, 0]),
      makeRun("3", multiSeatLabel("A", "right"), 11, [0, 0, 1, 0]),
      makeRun("4", multiSeatLabel("B", "center"), 30, [0, 4, 6, 2]),
      makeRun("5", multiSeatLabel("B", "left"), 34, [0, 5, 6.5, 3]),
      makeRun("6", multiSeatLabel("B", "right"), 35, [0, 4.5, 6.2, 2.8])
    ];

    const result = evaluateMultiSeatDecision(runs);

    expect(result.canDeclareWinner).toBe(true);
    expect(result.winner).toBe("A");
    expect(result.scoreDelta).toBeGreaterThan(result.scoreFloor);
  });
});
