export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

export function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function powerToDb(power: number): number {
  return 10 * Math.log10(Math.max(power, 1e-12));
}

export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) {
    return 0;
  }

  let sumSquares = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / samples.length);
}

export function peakAbs(samples: ArrayLike<number>): number {
  let peak = 0;

  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }

  return peak;
}

export function percentDiff(a: number, b: number): number {
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-6);
  return Math.abs(a - b) / denom;
}
