import { detectBeep } from "@/lib/audio/beepDetect";
import { goertzelDb } from "@/lib/audio/goertzel";
import {
  buildToneSchedule,
  SYNC_BEEP_FREQ_HZ,
  TEST_TONE_FREQUENCIES,
  TRACK_TIMINGS,
  type ToneSegment
} from "@/lib/constants/testTrack";
import type { Confidence, FrequencyMeasurement, RunHighlights } from "@/lib/types";
import { median, peakAbs, powerToDb, rms } from "@/lib/utils/math";

export interface AnalyzeRunInput {
  samples: Float32Array;
  sampleRate: number;
  manualBeepTimeSec?: number;
}

export interface AnalyzeRunOutput {
  beepDetected: boolean;
  confidence: Confidence;
  beepTimeSec: number;
  measurements: FrequencyMeasurement[];
  score: number;
  highlights: RunHighlights;
  clippingLikely: boolean;
  tooQuietLikely: boolean;
  peakDbfs: number;
  overallRmsDbfs: number;
  medianRawDb: number;
  beepToneLevelDb: number;
  volumeAnchorDb: number;
  schedule: ToneSegment[];
}

export interface SmoothnessSummary {
  score: number;
  highlights: RunHighlights;
}

export function calculateSmoothness(measurements: FrequencyMeasurement[]): SmoothnessSummary {
  if (!measurements.length) {
    return {
      score: 0,
      highlights: {
        worstPeakHz: TEST_TONE_FREQUENCIES[0],
        worstDipHz: TEST_TONE_FREQUENCIES[0],
        maxPeakDb: 0,
        maxDipDb: 0,
        deepDipCount: 0,
        bigPeakCount: 0
      }
    };
  }

  let score = 0;
  let worstPeak = measurements[0];
  let worstDip = measurements[0];
  let deepDipCount = 0;
  let bigPeakCount = 0;

  for (const point of measurements) {
    const d = point.levelRelDb;
    const peakPenalty = Math.max(0, d - 6) ** 2;
    const dipPenalty = Math.max(0, -10 - d) ** 2 * 1.5;
    score += peakPenalty + dipPenalty;

    if (point.levelRelDb > worstPeak.levelRelDb) {
      worstPeak = point;
    }

    if (point.levelRelDb < worstDip.levelRelDb) {
      worstDip = point;
    }

    if (d < -10) {
      deepDipCount += 1;
    }

    if (d > 6) {
      bigPeakCount += 1;
    }
  }

  return {
    score,
    highlights: {
      worstPeakHz: worstPeak.freqHz,
      worstDipHz: worstDip.freqHz,
      maxPeakDb: worstPeak.levelRelDb,
      maxDipDb: worstDip.levelRelDb,
      deepDipCount,
      bigPeakCount
    }
  };
}

export function computeToneScheduleFromBeep(beepTimeSec: number): ToneSegment[] {
  return buildToneSchedule(beepTimeSec);
}

function measureToneLevel(
  samples: Float32Array,
  sampleRate: number,
  freqHz: number,
  analysisStartSec: number,
  analysisEndSec: number
): number {
  const startSample = Math.max(0, Math.floor(analysisStartSec * sampleRate));
  const endSample = Math.min(samples.length, Math.floor(analysisEndSec * sampleRate));
  const windowSamples = Math.max(256, Math.floor(TRACK_TIMINGS.analysisWindowSec * sampleRate));

  if (endSample - startSample < windowSamples) {
    return -120;
  }

  const values: number[] = [];

  for (let offset = startSample; offset + windowSamples <= endSample; offset += windowSamples) {
    const frame = samples.subarray(offset, offset + windowSamples);
    values.push(goertzelDb(frame, sampleRate, freqHz));
  }

  if (!values.length) {
    return -120;
  }

  return median(values);
}

function measureBeepToneLevel(samples: Float32Array, sampleRate: number, beepTimeSec: number): number {
  const beepStart = beepTimeSec + 0.05;
  const beepEnd = beepTimeSec + TRACK_TIMINGS.beepSec - 0.05;

  return measureToneLevel(samples, sampleRate, SYNC_BEEP_FREQ_HZ, beepStart, beepEnd);
}

export function analyzeRun(input: AnalyzeRunInput): AnalyzeRunOutput {
  const { samples, sampleRate, manualBeepTimeSec } = input;

  const detection = detectBeep(samples, sampleRate);
  const beepDetected = detection.detected;

  const fallbackBeepTimeSec = typeof manualBeepTimeSec === "number" ? manualBeepTimeSec : TRACK_TIMINGS.preBeepSilenceSec;
  const beepTimeSec = beepDetected ? detection.timeSec : fallbackBeepTimeSec;

  const confidence: Confidence = beepDetected ? "high" : typeof manualBeepTimeSec === "number" ? "medium" : "low";

  const schedule = computeToneScheduleFromBeep(beepTimeSec);

  const levelBuckets = new Map<number, number[]>();

  for (const freq of TEST_TONE_FREQUENCIES) {
    levelBuckets.set(freq, []);
  }

  for (const segment of schedule) {
    const level = measureToneLevel(
      samples,
      sampleRate,
      segment.freqHz,
      segment.analysisStartSec,
      segment.analysisEndSec
    );

    levelBuckets.get(segment.freqHz)?.push(level);
  }

  const levelsRaw = TEST_TONE_FREQUENCIES.map((freq) => {
    const values = levelBuckets.get(freq) ?? [];
    return values.length ? median(values) : -120;
  });

  const medianRaw = median(levelsRaw);

  const measurements: FrequencyMeasurement[] = TEST_TONE_FREQUENCIES.map((freqHz, index) => ({
    freqHz,
    levelRaw: levelsRaw[index] ?? -120,
    levelRelDb: (levelsRaw[index] ?? -120) - medianRaw
  }));

  const { score, highlights } = calculateSmoothness(measurements);

  const peakValue = peakAbs(samples);
  const peakDbfs = powerToDb(peakValue * peakValue + 1e-12);
  const overallRmsDbfs = powerToDb(rms(samples) ** 2 + 1e-12);
  const beepToneLevelDb = measureBeepToneLevel(samples, sampleRate, beepTimeSec);
  const volumeAnchorDb = medianRaw;

  return {
    beepDetected,
    confidence,
    beepTimeSec,
    measurements,
    score,
    highlights,
    clippingLikely: peakValue > 0.98,
    tooQuietLikely: overallRmsDbfs < -55,
    peakDbfs,
    overallRmsDbfs,
    medianRawDb: medianRaw,
    beepToneLevelDb,
    volumeAnchorDb,
    schedule
  };
}
