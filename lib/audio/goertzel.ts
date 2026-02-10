import { powerToDb } from "@/lib/utils/math";

export function goertzelPower(samples: ArrayLike<number>, sampleRate: number, targetFreqHz: number): number {
  if (!samples.length || sampleRate <= 0 || targetFreqHz <= 0) {
    return 0;
  }

  const omega = (2 * Math.PI * targetFreqHz) / sampleRate;
  const coeff = 2 * Math.cos(omega);

  let q0 = 0;
  let q1 = 0;
  let q2 = 0;

  for (let i = 0; i < samples.length; i += 1) {
    q0 = coeff * q1 - q2 + (samples[i] ?? 0);
    q2 = q1;
    q1 = q0;
  }

  const real = q1 - q2 * Math.cos(omega);
  const imag = q2 * Math.sin(omega);
  return (real * real + imag * imag) / Math.max(samples.length, 1);
}

export function goertzelDb(samples: ArrayLike<number>, sampleRate: number, targetFreqHz: number): number {
  return powerToDb(goertzelPower(samples, sampleRate, targetFreqHz));
}
