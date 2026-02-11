import { describe, expect, it } from "vitest";
import type { BassRun } from "@/lib/types";
import {
  buildRepeatabilityProfile,
  evaluateRepeatabilityDecision,
  groupRunsByLabel
} from "@/lib/utils/repeatability";

function makeRun(id: string, label: string, score: number, rel: number[], qualityScore = 90): BassRun {
  const freqs = [25, 40, 63, 80];

  return {
    id,
    createdAt: new Date(Date.now() + Number(id.replace(/\D/g, "") || 0) * 1000).toISOString(),
    mode: "ab",
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
      score: qualityScore,
      tier: qualityScore >= 85 ? "excellent" : "usable",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -24,
    volumeAnchorDb: -30
  };
}

describe("groupRunsByLabel", () => {
  it("groups runs by label and sorts by count", () => {
    const runs = [
      makeRun("1", "Placement A", 12, [0, 1, 2, 1]),
      makeRun("2", "Placement B", 16, [-1, 0, 1, 0]),
      makeRun("3", "Placement A", 10, [0, 1, 2, 0.5])
    ];

    const groups = groupRunsByLabel(runs);

    expect(groups[0]?.label).toBe("Placement A");
    expect(groups[0]?.runs.length).toBe(2);
    expect(groups[1]?.label).toBe("Placement B");
  });
});

describe("buildRepeatabilityProfile", () => {
  it("builds a median profile from latest 2-3 runs", () => {
    const runs = [
      makeRun("1", "Placement A", 18, [0, 0, 4, 0]),
      makeRun("2", "Placement A", 12, [0, 1, 3, 0]),
      makeRun("3", "Placement A", 10, [0, 0.5, 2.5, -0.2]),
      makeRun("4", "Placement A", 50, [8, 8, 8, 8])
    ];

    const profile = buildRepeatabilityProfile("Placement A", runs, 3);

    expect(profile).not.toBeNull();
    expect(profile?.sourceRuns.length).toBe(3);
    expect(profile?.scoreSpread).toBeGreaterThanOrEqual(0);
    expect(profile?.curveNoiseFloorDb).toBeGreaterThanOrEqual(0);
  });

  it("requires at least two runs", () => {
    const profile = buildRepeatabilityProfile("Placement A", [makeRun("1", "Placement A", 10, [0, 0, 0, 0])], 3);
    expect(profile).toBeNull();
  });
});

describe("evaluateRepeatabilityDecision", () => {
  it("blocks winner when score delta is inside noise floor", () => {
    const profileA = buildRepeatabilityProfile(
      "Placement A",
      [
        makeRun("1", "Placement A", 20, [0, 1, 2, 0]),
        makeRun("2", "Placement A", 25, [0, 1, 2, 0.2]),
        makeRun("3", "Placement A", 23, [0.1, 1, 1.9, 0])
      ],
      3
    );

    const profileB = buildRepeatabilityProfile(
      "Placement B",
      [
        makeRun("4", "Placement B", 24, [0, 0.5, 2.2, 0]),
        makeRun("5", "Placement B", 22, [0, 0.4, 2.1, -0.1]),
        makeRun("6", "Placement B", 23, [0, 0.5, 2.0, 0])
      ],
      3
    );

    expect(profileA).not.toBeNull();
    expect(profileB).not.toBeNull();

    const decision = evaluateRepeatabilityDecision(profileA!, profileB!);
    expect(decision.canDeclareWinner).toBe(false);
  });

  it("allows winner when score delta exceeds noise floor", () => {
    const profileA = buildRepeatabilityProfile(
      "Placement A",
      [
        makeRun("1", "Placement A", 8, [0, 0, 0, 0]),
        makeRun("2", "Placement A", 9, [0, 0.1, 0.2, 0])
      ],
      3
    );

    const profileB = buildRepeatabilityProfile(
      "Placement B",
      [
        makeRun("4", "Placement B", 40, [0, 5, 8, 4]),
        makeRun("5", "Placement B", 42, [0.5, 5.2, 8.1, 3.8])
      ],
      3
    );

    expect(profileA).not.toBeNull();
    expect(profileB).not.toBeNull();

    const decision = evaluateRepeatabilityDecision(profileA!, profileB!);
    expect(decision.canDeclareWinner).toBe(true);
  });
});
