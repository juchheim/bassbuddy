import { describe, expect, it } from "vitest";
import { detectBeep } from "@/lib/audio/beepDetect";
import { createSyntheticTrack } from "@/tests/helpers/syntheticSignal";

describe("detectBeep", () => {
  it("finds the sync beep near expected time in noisy signal", () => {
    const synthetic = createSyntheticTrack({
      noiseAmplitude: 0.004
    });

    const detection = detectBeep(synthetic.signal, synthetic.sampleRate);

    expect(detection.detected).toBe(true);
    expect(detection.timeSec).toBeGreaterThan(0.4);
    expect(detection.timeSec).toBeLessThan(0.7);
  });
});
