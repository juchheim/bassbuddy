import { describe, expect, it } from "vitest";
import { scoutLabel } from "@/lib/constants/scout";
import type { BassRun } from "@/lib/types";
import { buildScoutRanking, scoutPromotionLabels } from "@/lib/utils/scout";

function makeRun(id: string, label: string, score: number, deepDipCount: number, maxPeakDb: number): BassRun {
  const freqs = [25, 40, 63, 80];

  return {
    id,
    createdAt: new Date(Date.now() + Number(id.replace(/\D/g, "") || 0) * 1000).toISOString(),
    mode: "scout",
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
    measurements: freqs.map((freq) => ({
      freqHz: freq,
      levelRaw: -30,
      levelRelDb: 0
    })),
    score,
    highlights: {
      worstPeakHz: 63,
      worstDipHz: 25,
      maxPeakDb,
      maxDipDb: -6,
      deepDipCount,
      bigPeakCount: maxPeakDb > 6 ? 1 : 0
    },
    quality: {
      score: 90,
      tier: "excellent",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -25,
    volumeAnchorDb: -30
  };
}

describe("buildScoutRanking", () => {
  it("ranks candidates by score, then deep dips, then peak", () => {
    const runs: BassRun[] = [
      makeRun("1", scoutLabel(1), 22, 1, 5.5),
      makeRun("2", scoutLabel(2), 22, 0, 6.5),
      makeRun("3", scoutLabel(3), 18, 1, 7),
      makeRun("4", scoutLabel(4), 30, 2, 8)
    ];

    const ranking = buildScoutRanking(runs);

    expect(ranking.candidates).toHaveLength(4);
    expect(ranking.candidates[0]?.label).toBe(scoutLabel(3));
    expect(ranking.candidates[1]?.label).toBe(scoutLabel(2));
    expect(ranking.candidates[2]?.label).toBe(scoutLabel(1));
    expect(ranking.topTwo?.[0].rank).toBe(1);
    expect(ranking.topTwo?.[1].rank).toBe(2);
  });

  it("keeps newest run per scout label", () => {
    const older = makeRun("1", scoutLabel(1), 30, 2, 8);
    const newer = makeRun("100", scoutLabel(1), 12, 0, 4);

    const ranking = buildScoutRanking([older, newer, makeRun("2", scoutLabel(2), 15, 0, 5)]);
    expect(ranking.candidates[0]?.label).toBe(scoutLabel(1));
    expect(ranking.candidates[0]?.run.score).toBe(12);
  });
});

describe("scoutPromotionLabels", () => {
  it("builds A/B labels from top scout picks", () => {
    const ranking = buildScoutRanking([
      makeRun("1", scoutLabel(1), 14, 0, 4),
      makeRun("2", scoutLabel(2), 16, 0, 5)
    ]);

    expect(ranking.topTwo).not.toBeNull();
    const labels = scoutPromotionLabels(ranking.topTwo!);
    expect(labels.A).toContain(scoutLabel(1));
    expect(labels.B).toContain(scoutLabel(2));
  });
});
