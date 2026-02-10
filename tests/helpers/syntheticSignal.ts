import { TEST_TONE_FREQUENCIES, TRACK_TIMINGS, TRACK_TOTAL_SEC, buildToneSchedule } from "@/lib/constants/testTrack";

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

function lcg(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function writeSine(
  target: Float32Array,
  sampleRate: number,
  freqHz: number,
  startSec: number,
  durationSec: number,
  amplitude: number
): void {
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const count = Math.max(0, Math.floor(durationSec * sampleRate));

  for (let i = 0; i < count && start + i < target.length; i += 1) {
    const t = i / sampleRate;
    target[start + i] += Math.sin(2 * Math.PI * freqHz * t) * amplitude;
  }
}

export interface SyntheticTrackOptions {
  sampleRate?: number;
  toneDbByFreq?: Partial<Record<number, number>>;
  noiseAmplitude?: number;
  beepAmplitude?: number;
  toneAmplitude?: number;
}

export function createSyntheticTrack(options: SyntheticTrackOptions = {}) {
  const sampleRate = options.sampleRate ?? 48_000;
  const beepAmplitude = options.beepAmplitude ?? 0.35;
  const toneAmplitude = options.toneAmplitude ?? 0.45;
  const noiseAmplitude = options.noiseAmplitude ?? 0.002;

  const totalSamples = Math.floor(TRACK_TOTAL_SEC * sampleRate);
  const signal = new Float32Array(totalSamples);

  const beepStartSec = TRACK_TIMINGS.preBeepSilenceSec;

  writeSine(signal, sampleRate, 1000, beepStartSec, TRACK_TIMINGS.beepSec, beepAmplitude);

  const schedule = buildToneSchedule(beepStartSec);

  for (const segment of schedule) {
    const gainDb = options.toneDbByFreq?.[segment.freqHz] ?? 0;
    const amplitude = toneAmplitude * dbToLinear(gainDb);
    writeSine(
      signal,
      sampleRate,
      segment.freqHz,
      segment.toneStartSec,
      TRACK_TIMINGS.toneSec,
      amplitude
    );
  }

  const noiseRandom = lcg(1337);

  for (let i = 0; i < signal.length; i += 1) {
    const noise = (noiseRandom() * 2 - 1) * noiseAmplitude;
    signal[i] += noise;
    signal[i] = Math.max(-1, Math.min(1, signal[i]));
  }

  const inputDb = TEST_TONE_FREQUENCIES.map((freq) => options.toneDbByFreq?.[freq] ?? 0);

  const sorted = [...inputDb].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianDb =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];

  const expectedRelativeDb = TEST_TONE_FREQUENCIES.map((freq) => (options.toneDbByFreq?.[freq] ?? 0) - medianDb);

  return {
    signal,
    sampleRate,
    beepStartSec,
    expectedRelativeDb
  };
}
