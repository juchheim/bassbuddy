import fs from "node:fs";
import path from "node:path";

const sampleRate = 48_000;
const frequencies = [25, 31.5, 40, 50, 63, 80, 100, 125];

const timings = {
  preBeepSilenceSec: 0.5,
  beepSec: 0.5,
  postBeepSilenceSec: 0.5,
  preToneSilenceSec: 0.25,
  toneSec: 4.0,
  postToneSilenceSec: 0.25,
  tonePasses: 2,
  tailSilenceSec: 1.5
};

const beepFreqHz = 1000;
const beepAmp = 0.35;
const toneAmp = 0.48;
const useWarble = false;
const warbleDepth = 0.03;
const warbleRateHz = 4;

const stepBlockSec = timings.preToneSilenceSec + timings.toneSec + timings.postToneSilenceSec;
const totalSec =
  timings.preBeepSilenceSec +
  timings.beepSec +
  timings.postBeepSilenceSec +
  stepBlockSec * frequencies.length * timings.tonePasses +
  timings.tailSilenceSec;

const totalSamples = Math.floor(totalSec * sampleRate);
const signal = new Float32Array(totalSamples);

let writeIndex = 0;

function writeSilence(durationSec) {
  const count = Math.floor(durationSec * sampleRate);
  writeIndex += count;
}

function writeSine(freqHz, durationSec, amplitude) {
  const count = Math.floor(durationSec * sampleRate);
  let phase = 0;

  for (let i = 0; i < count && writeIndex < signal.length; i += 1) {
    const t = i / sampleRate;
    const effectiveFreq = useWarble
      ? freqHz * (1 + warbleDepth * Math.sin(2 * Math.PI * warbleRateHz * t))
      : freqHz;

    phase += (2 * Math.PI * effectiveFreq) / sampleRate;
    signal[writeIndex] = Math.sin(phase) * amplitude;
    writeIndex += 1;
  }
}

writeSilence(timings.preBeepSilenceSec);
writeSine(beepFreqHz, timings.beepSec, beepAmp);
writeSilence(timings.postBeepSilenceSec);

for (let pass = 0; pass < timings.tonePasses; pass += 1) {
  for (const freq of frequencies) {
    writeSilence(timings.preToneSilenceSec);
    writeSine(freq, timings.toneSec, toneAmp);
    writeSilence(timings.postToneSilenceSec);
  }
}

writeSilence(timings.tailSilenceSec);

function floatToInt16(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

function writeWavMono16(samples, sr, outPath) {
  const dataSize = samples.length * 2;
  const fileSize = 44 + dataSize;
  const out = Buffer.alloc(fileSize);

  out.write("RIFF", 0);
  out.writeUInt32LE(fileSize - 8, 4);
  out.write("WAVE", 8);

  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24);
  out.writeUInt32LE(sr * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);

  out.write("data", 36);
  out.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    out.writeInt16LE(floatToInt16(samples[i]), 44 + i * 2);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
}

const outputPath = path.resolve("public/test-tracks/bassbuddy_mvp.wav");
writeWavMono16(signal, sampleRate, outputPath);

console.log(`Generated: ${outputPath}`);
console.log(`Duration: ${totalSec.toFixed(2)} sec`);
console.log(`Sample rate: ${sampleRate} Hz`);
