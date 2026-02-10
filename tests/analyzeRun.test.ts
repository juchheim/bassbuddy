import { describe, expect, it } from "vitest";
import { analyzeRun, calculateSmoothness, computeToneScheduleFromBeep } from "@/lib/audio/analyzeRun";
import { TEST_TONE_FREQUENCIES, TRACK_STEP_BLOCK_SEC } from "@/lib/constants/testTrack";
import type { FrequencyMeasurement } from "@/lib/types";
import { createSyntheticTrack } from "@/tests/helpers/syntheticSignal";

describe("computeToneScheduleFromBeep", () => {
  it("builds expected first and second pass timing", () => {
    const schedule = computeToneScheduleFromBeep(0.5);

    expect(schedule.length).toBe(TEST_TONE_FREQUENCIES.length * 2);
    expect(schedule[0]?.toneStartSec).toBeCloseTo(1.75, 3);

    const secondPassFirst = schedule[TEST_TONE_FREQUENCIES.length];
    expect(secondPassFirst?.freqHz).toBe(TEST_TONE_FREQUENCIES[0]);
    expect(secondPassFirst?.toneStartSec).toBeCloseTo(1.75 + TRACK_STEP_BLOCK_SEC * TEST_TONE_FREQUENCIES.length, 3);
  });
});

describe("calculateSmoothness", () => {
  it("applies peak and dip penalties correctly", () => {
    const points: FrequencyMeasurement[] = [
      { freqHz: 25, levelRaw: 0, levelRelDb: -12 },
      { freqHz: 40, levelRaw: 0, levelRelDb: 0 },
      { freqHz: 63, levelRaw: 0, levelRelDb: 8 }
    ];

    const result = calculateSmoothness(points);

    expect(result.score).toBeCloseTo(10, 5);
    expect(result.highlights.worstDipHz).toBe(25);
    expect(result.highlights.worstPeakHz).toBe(63);
    expect(result.highlights.deepDipCount).toBe(1);
    expect(result.highlights.bigPeakCount).toBe(1);
  });
});

describe("analyzeRun", () => {
  it("recovers relative level shape from synthetic stepped tones", () => {
    const map = {
      25: -6,
      31.5: -3,
      40: 0,
      50: 6,
      63: 3,
      80: 0,
      100: -2,
      125: 4
    } as const;

    const synthetic = createSyntheticTrack({ toneDbByFreq: map, noiseAmplitude: 0.001 });
    const analysis = analyzeRun({
      samples: synthetic.signal,
      sampleRate: synthetic.sampleRate
    });

    expect(analysis.beepDetected).toBe(true);
    expect(analysis.measurements).toHaveLength(TEST_TONE_FREQUENCIES.length);

    analysis.measurements.forEach((point, index) => {
      const expected = synthetic.expectedRelativeDb[index] ?? 0;
      expect(Math.abs(point.levelRelDb - expected)).toBeLessThan(0.2);
    });
  });
});
