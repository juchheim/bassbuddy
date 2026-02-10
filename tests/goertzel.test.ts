import { describe, expect, it } from "vitest";
import { goertzelPower } from "@/lib/audio/goertzel";

function sine(freqHz: number, sampleRate: number, durationSec: number, amp = 1): Float32Array {
  const count = Math.floor(sampleRate * durationSec);
  const output = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    output[i] = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amp;
  }

  return output;
}

describe("goertzelPower", () => {
  it("strongly responds to the target sine frequency", () => {
    const sampleRate = 48_000;
    const samples = sine(63, sampleRate, 1.0, 0.8);

    const targetPower = goertzelPower(samples, sampleRate, 63);
    const offPower = goertzelPower(samples, sampleRate, 80);

    expect(targetPower).toBeGreaterThan(offPower * 10);
  });
});
