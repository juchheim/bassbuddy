import { describe, expect, it } from "vitest";
import { multiSeatLabel } from "@/lib/constants/multiSeat";
import type { BassRun, RunMode } from "@/lib/types";
import { buildDecisionReport, compareDecisionReports, reportPrintText } from "@/lib/utils/decisionAssistant";

function makeRun(params: {
  id: string;
  mode: RunMode;
  label: string;
  score: number;
  rel?: number[];
  deepDipCount?: number;
  maxPeakDb?: number;
  createdAtOffsetSec?: number;
  volumeAnchorDb?: number;
}): BassRun {
  const rel = params.rel ?? [0, 0, 0, 0];
  const freqs = [25, 40, 63, 80];

  return {
    id: params.id,
    createdAt: new Date(Date.now() + (params.createdAtOffsetSec ?? 0) * 1000).toISOString(),
    mode: params.mode,
    label: params.label,
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
    score: params.score,
    highlights: {
      worstPeakHz: 63,
      worstDipHz: 25,
      maxPeakDb: params.maxPeakDb ?? Math.max(...rel),
      maxDipDb: Math.min(...rel),
      deepDipCount: params.deepDipCount ?? rel.filter((value) => value < -10).length,
      bigPeakCount: rel.filter((value) => value > 6).length
    },
    quality: {
      score: 92,
      tier: "excellent",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -25,
    volumeAnchorDb: params.volumeAnchorDb ?? -30
  };
}

describe("buildDecisionReport", () => {
  it("declares a strong final recommendation when evidence aligns", () => {
    const runs: BassRun[] = [
      makeRun({ id: "ab-a1", mode: "ab", label: "Placement A", score: 10 }),
      makeRun({ id: "ab-a2", mode: "ab", label: "Placement A", score: 11, createdAtOffsetSec: 1 }),
      makeRun({ id: "ab-b1", mode: "ab", label: "Placement B", score: 28 }),
      makeRun({ id: "ab-b2", mode: "ab", label: "Placement B", score: 30, createdAtOffsetSec: 2 }),
      makeRun({ id: "ms-a-c", mode: "multiseat", label: multiSeatLabel("A", "center"), score: 12 }),
      makeRun({ id: "ms-a-l", mode: "multiseat", label: multiSeatLabel("A", "left"), score: 13 }),
      makeRun({ id: "ms-a-r", mode: "multiseat", label: multiSeatLabel("A", "right"), score: 14 }),
      makeRun({ id: "ms-b-c", mode: "multiseat", label: multiSeatLabel("B", "center"), score: 34 }),
      makeRun({ id: "ms-b-l", mode: "multiseat", label: multiSeatLabel("B", "left"), score: 35 }),
      makeRun({ id: "ms-b-r", mode: "multiseat", label: multiSeatLabel("B", "right"), score: 36 }),
      makeRun({ id: "ph-0", mode: "phase", label: "Phase 0", score: 9 }),
      makeRun({ id: "ph-180", mode: "phase", label: "Phase 180", score: 24 })
    ];

    const report = buildDecisionReport(runs);

    expect(report.placement.winner).toBe("Placement A");
    expect(report.phase.winner).toBe("Phase 0°");
    expect(report.overallConfidence).not.toBe("low");
    expect(report.summary).toContain("Placement A");
    expect(report.summary).toContain("Phase 0°");
  });

  it("withholds placement winner when seat and multi-seat evidence conflict", () => {
    const runs: BassRun[] = [
      makeRun({ id: "ab-a", mode: "ab", label: "Placement A", score: 10 }),
      makeRun({ id: "ab-b", mode: "ab", label: "Placement B", score: 30 }),
      makeRun({ id: "ms-a-c", mode: "multiseat", label: multiSeatLabel("A", "center"), score: 30 }),
      makeRun({ id: "ms-a-l", mode: "multiseat", label: multiSeatLabel("A", "left"), score: 31 }),
      makeRun({ id: "ms-a-r", mode: "multiseat", label: multiSeatLabel("A", "right"), score: 32 }),
      makeRun({ id: "ms-b-c", mode: "multiseat", label: multiSeatLabel("B", "center"), score: 12 }),
      makeRun({ id: "ms-b-l", mode: "multiseat", label: multiSeatLabel("B", "left"), score: 13 }),
      makeRun({ id: "ms-b-r", mode: "multiseat", label: multiSeatLabel("B", "right"), score: 14 })
    ];

    const report = buildDecisionReport(runs);

    expect(report.placement.winner).toBeNull();
    expect(report.placement.blockers.some((entry) => entry.includes("conflicts"))).toBe(true);
    expect(report.nextActions.length).toBeGreaterThan(0);
  });
});

describe("reportPrintText", () => {
  it("renders a printable summary text block", () => {
    const report = buildDecisionReport([
      makeRun({ id: "ab-a", mode: "ab", label: "Placement A", score: 10 }),
      makeRun({ id: "ab-b", mode: "ab", label: "Placement B", score: 18 })
    ]);

    const text = reportPrintText(report);

    expect(text).toContain("BassBuddy Final Decision Report");
    expect(text).toContain("Placement");
    expect(text).toContain("Next Actions");
  });
});

describe("compareDecisionReports", () => {
  it("captures winner/confidence changes and score delta", () => {
    const previous = buildDecisionReport([
      makeRun({ id: "prev-a", mode: "ab", label: "Placement A", score: 10 }),
      makeRun({ id: "prev-b", mode: "ab", label: "Placement B", score: 25 })
    ]);

    const current = buildDecisionReport([
      makeRun({ id: "curr-a", mode: "ab", label: "Placement A", score: 25 }),
      makeRun({ id: "curr-b", mode: "ab", label: "Placement B", score: 9 })
    ]);

    const delta = compareDecisionReports(previous, current);

    expect(delta.placementWinnerChanged).toBe(true);
    expect(Number.isFinite(delta.overallScoreDelta)).toBe(true);
  });
});
