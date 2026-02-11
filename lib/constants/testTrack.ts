export const TEST_TONE_FREQUENCIES = [25, 31.5, 40, 50, 63, 80, 100, 125] as const;
export const SYNC_BEEP_FREQ_HZ = 1000;

export const TRACK_TIMINGS = {
  preBeepSilenceSec: 0.5,
  beepSec: 0.5,
  postBeepSilenceSec: 0.5,
  preToneSilenceSec: 0.25,
  toneSec: 4.0,
  postToneSilenceSec: 0.25,
  tonePasses: 2,
  tailSilenceSec: 1.5,
  analysisSettleSec: 0.5,
  analysisWindowSec: 0.2
} as const;

export const TRACK_STEP_BLOCK_SEC =
  TRACK_TIMINGS.preToneSilenceSec + TRACK_TIMINGS.toneSec + TRACK_TIMINGS.postToneSilenceSec;

export const TRACK_TOTAL_SEC =
  TRACK_TIMINGS.preBeepSilenceSec +
  TRACK_TIMINGS.beepSec +
  TRACK_TIMINGS.postBeepSilenceSec +
  TRACK_STEP_BLOCK_SEC * TEST_TONE_FREQUENCIES.length * TRACK_TIMINGS.tonePasses +
  TRACK_TIMINGS.tailSilenceSec;

export const TRACK_DURATION_AFTER_BEEP_SEC =
  TRACK_TIMINGS.beepSec +
  TRACK_TIMINGS.postBeepSilenceSec +
  TRACK_STEP_BLOCK_SEC * TEST_TONE_FREQUENCIES.length * TRACK_TIMINGS.tonePasses +
  TRACK_TIMINGS.tailSilenceSec;

export const MANUAL_START_TIMEOUT_SEC = 8;
export const MAX_RECORD_SECONDS = 120;

export interface ToneSegment {
  passIndex: number;
  stepIndex: number;
  freqHz: number;
  toneStartSec: number;
  toneEndSec: number;
  analysisStartSec: number;
  analysisEndSec: number;
}

export function buildToneSchedule(beepStartSec: number): ToneSegment[] {
  const output: ToneSegment[] = [];
  const stepsPerPass = TEST_TONE_FREQUENCIES.length;

  for (let passIndex = 0; passIndex < TRACK_TIMINGS.tonePasses; passIndex += 1) {
    for (let freqIndex = 0; freqIndex < TEST_TONE_FREQUENCIES.length; freqIndex += 1) {
      const freqHz = TEST_TONE_FREQUENCIES[freqIndex];
      const stepIndex = passIndex * stepsPerPass + freqIndex;

      const toneStartSec =
        beepStartSec +
        TRACK_TIMINGS.beepSec +
        TRACK_TIMINGS.postBeepSilenceSec +
        stepIndex * TRACK_STEP_BLOCK_SEC +
        TRACK_TIMINGS.preToneSilenceSec;

      const toneEndSec = toneStartSec + TRACK_TIMINGS.toneSec;

      output.push({
        passIndex,
        stepIndex,
        freqHz,
        toneStartSec,
        toneEndSec,
        analysisStartSec: toneStartSec + TRACK_TIMINGS.analysisSettleSec,
        analysisEndSec: toneEndSec
      });
    }
  }

  return output;
}
