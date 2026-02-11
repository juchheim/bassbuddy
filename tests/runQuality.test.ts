import { describe, expect, it } from "vitest";
import type { BassRun } from "@/lib/types";
import { assessQuickPreflight, evaluateCompareReadiness, evaluateRunQuality } from "@/lib/utils/runQuality";

function makeRun(overrides: Partial<BassRun> = {}): BassRun {
  return {
    id: overrides.id ?? `run-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    mode: overrides.mode ?? "ab",
    label: overrides.label,
    deviceInfo: overrides.deviceInfo ?? { userAgent: "test", platform: "test" },
    micSettings:
      overrides.micSettings ??
      ({
        requested: {},
        supported: {},
        settings: {},
        capabilities: {},
        processingRisk: "low",
        warnings: []
      } as BassRun["micSettings"]),
    sampleRate: overrides.sampleRate ?? 48_000,
    beepDetected: overrides.beepDetected ?? true,
    confidence: overrides.confidence ?? "high",
    measurements:
      overrides.measurements ??
      [
        { freqHz: 25, levelRaw: -30, levelRelDb: -2 },
        { freqHz: 40, levelRaw: -28, levelRelDb: 0 },
        { freqHz: 63, levelRaw: -27, levelRelDb: 1 },
        { freqHz: 80, levelRaw: -29, levelRelDb: -1 }
      ],
    score: overrides.score ?? 10,
    highlights:
      overrides.highlights ??
      ({
        worstPeakHz: 63,
        worstDipHz: 25,
        maxPeakDb: 1,
        maxDipDb: -2,
        deepDipCount: 0,
        bigPeakCount: 0
      } as BassRun["highlights"]),
    quality: overrides.quality,
    medianRawLevelDb: overrides.medianRawLevelDb ?? -28.5,
    beepToneLevelDb: overrides.beepToneLevelDb ?? -24,
    volumeAnchorDb: overrides.volumeAnchorDb ?? -28.5,
    notes: overrides.notes
  };
}

describe("evaluateRunQuality", () => {
  it("returns high score for clean captures", () => {
    const quality = evaluateRunQuality({
      confidence: "high",
      beepDetected: true,
      clippingLikely: false,
      tooQuietLikely: false,
      micProcessingRisk: "low",
      peakDbfs: -4,
      overallRmsDbfs: -28,
      beepToneLevelDb: -22
    });

    expect(quality.blocking).toBe(false);
    expect(quality.tier).toBe("excellent");
    expect(quality.score).toBeGreaterThanOrEqual(85);
  });

  it("marks poor-quality captures as blocking", () => {
    const quality = evaluateRunQuality({
      confidence: "low",
      beepDetected: false,
      clippingLikely: true,
      tooQuietLikely: true,
      micProcessingRisk: "high",
      peakDbfs: -0.1,
      overallRmsDbfs: -65,
      beepToneLevelDb: -70
    });

    expect(quality.blocking).toBe(true);
    expect(quality.tier).toBe("poor");
    expect(quality.score).toBeLessThan(65);
  });
});

describe("evaluateCompareReadiness", () => {
  it("blocks compare when volume mismatch is large", () => {
    const runA = makeRun({ label: "A", volumeAnchorDb: -26, quality: { score: 90, tier: "excellent", blocking: false, issues: [] } });
    const runB = makeRun({ label: "B", id: "run-b", volumeAnchorDb: -31, quality: { score: 92, tier: "excellent", blocking: false, issues: [] } });

    const readiness = evaluateCompareReadiness(runA, runB);

    expect(readiness.canDeclareWinner).toBe(false);
    expect(readiness.blockers.some((entry) => entry.includes("Playback level mismatch"))).toBe(true);
  });

  it("provides repeatability signal for similar curves", () => {
    const runA = makeRun({ id: "run-a", quality: { score: 90, tier: "excellent", blocking: false, issues: [] } });
    const runB = makeRun({
      id: "run-b",
      quality: { score: 88, tier: "excellent", blocking: false, issues: [] },
      measurements: [
        { freqHz: 25, levelRaw: -30.1, levelRelDb: -1.8 },
        { freqHz: 40, levelRaw: -28.2, levelRelDb: 0.1 },
        { freqHz: 63, levelRaw: -27.1, levelRelDb: 1.1 },
        { freqHz: 80, levelRaw: -29.3, levelRelDb: -1.1 }
      ],
      volumeAnchorDb: -28.7
    });

    const readiness = evaluateCompareReadiness(runA, runB);

    expect(readiness.canDeclareWinner).toBe(true);
    expect(readiness.repeatability).not.toBeNull();
    expect(readiness.repeatability?.verdict).not.toBe("low");
  });
});

describe("assessQuickPreflight", () => {
  it("passes clean levels", () => {
    const assessment = assessQuickPreflight({
      peak: 0.72,
      meanRms: 0.008,
      micProcessingRisk: "low"
    });

    expect(assessment.grade).toBe("pass");
    expect(assessment.warnings).toHaveLength(0);
  });

  it("fails clipping and very quiet input", () => {
    const assessment = assessQuickPreflight({
      peak: 0.995,
      meanRms: 0.0018,
      micProcessingRisk: "low"
    });

    expect(assessment.grade).toBe("fail");
    expect(assessment.warnings.some((entry) => entry.includes("Clipping"))).toBe(true);
    expect(assessment.warnings.some((entry) => entry.includes("very quiet"))).toBe(true);
  });

  it("warns when mic processing risk is high", () => {
    const assessment = assessQuickPreflight({
      peak: 0.68,
      meanRms: 0.006,
      micProcessingRisk: "high"
    });

    expect(assessment.grade).toBe("warn");
    expect(assessment.warnings.some((entry) => entry.includes("processing"))).toBe(true);
  });
});
