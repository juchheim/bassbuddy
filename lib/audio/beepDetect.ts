import { goertzelPower } from "@/lib/audio/goertzel";
import { median, powerToDb, rms } from "@/lib/utils/math";

export interface BeepDetectOptions {
  beepFreqHz?: number;
  frameSize?: number;
  hopSize?: number;
  thresholdOverBaselineDb?: number;
  minConsecutiveFrames?: number;
  baselineFrames?: number;
  searchStartSample?: number;
}

export interface BeepDetectionResult {
  detected: boolean;
  sampleIndex: number;
  timeSec: number;
  confidence: number;
  thresholdDb: number;
  peakDb: number;
}

export function detectBeep(samples: Float32Array, sampleRate: number, options: BeepDetectOptions = {}): BeepDetectionResult {
  const beepFreqHz = options.beepFreqHz ?? 1000;
  const frameSize = options.frameSize ?? 2048;
  const hopSize = options.hopSize ?? 512;
  const thresholdOverBaselineDb = options.thresholdOverBaselineDb ?? 15;
  const minConsecutiveFrames = options.minConsecutiveFrames ?? 3;
  const baselineFrames = options.baselineFrames ?? 20;
  const searchStartSample = Math.max(0, options.searchStartSample ?? 0);

  if (samples.length < frameSize || sampleRate <= 0) {
    return {
      detected: false,
      sampleIndex: -1,
      timeSec: -1,
      confidence: 0,
      thresholdDb: -Infinity,
      peakDb: -Infinity
    };
  }

  const toneScores: number[] = [];
  const frameStarts: number[] = [];

  for (let start = searchStartSample; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    const tonePower = goertzelPower(frame, sampleRate, beepFreqHz);
    const broadbandPower = rms(frame) ** 2;

    // Ratio to broadband power helps reject non-tonal transients.
    const scoreDb = powerToDb(tonePower + 1e-12) - powerToDb(broadbandPower + 1e-12);

    toneScores.push(scoreDb);
    frameStarts.push(start);
  }

  if (toneScores.length < baselineFrames + minConsecutiveFrames) {
    return {
      detected: false,
      sampleIndex: -1,
      timeSec: -1,
      confidence: 0,
      thresholdDb: -Infinity,
      peakDb: -Infinity
    };
  }

  const baseline = median(toneScores.slice(0, baselineFrames));
  const thresholdDb = baseline + thresholdOverBaselineDb;

  let streak = 0;
  let streakStartFrame = -1;
  let peakDb = -Infinity;

  for (let i = baselineFrames; i < toneScores.length; i += 1) {
    const frameScore = toneScores[i];
    peakDb = Math.max(peakDb, frameScore);

    if (frameScore > thresholdDb) {
      if (streak === 0) {
        streakStartFrame = i;
      }
      streak += 1;

      if (streak >= minConsecutiveFrames) {
        const firstHitIndex = Math.max(streakStartFrame, 0);
        const sampleIndex = frameStarts[firstHitIndex] ?? -1;
        const timeSec = sampleIndex / sampleRate;
        const confidence = Math.max(0, Math.min(1, (peakDb - thresholdDb) / 18 + 0.5));

        return {
          detected: true,
          sampleIndex,
          timeSec,
          confidence,
          thresholdDb,
          peakDb
        };
      }
    } else {
      streak = 0;
      streakStartFrame = -1;
    }
  }

  return {
    detected: false,
    sampleIndex: -1,
    timeSec: -1,
    confidence: 0,
    thresholdDb,
    peakDb
  };
}
