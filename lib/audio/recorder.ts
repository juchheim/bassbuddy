import { WORKLET_PROCESSOR_PATH } from "@/lib/audio/worklet-processor";
import type { MicSettingsSnapshot } from "@/lib/types";
import { peakAbs, rms } from "@/lib/utils/math";

export const REQUESTED_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
};

export interface RecorderChunkMeta {
  rms: number;
  peak: number;
  elapsedSec: number;
  sampleRate: number;
}

export interface RecorderOptions {
  onChunk?: (chunk: Float32Array, meta: RecorderChunkMeta) => void;
}

export interface RecorderSession {
  sampleRate: number;
  micSettings: MicSettingsSnapshot;
  stop: () => Promise<Float32Array>;
}

function concatFloat32(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

export function getSupportedAudioConstraints() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) {
    return {
      echoCancellation: undefined,
      noiseSuppression: undefined,
      autoGainControl: undefined
    };
  }

  const supported = navigator.mediaDevices.getSupportedConstraints();
  return {
    echoCancellation: supported.echoCancellation,
    noiseSuppression: supported.noiseSuppression,
    autoGainControl: supported.autoGainControl
  };
}

export function captureMicSettingsSnapshot(track: MediaStreamTrack): MicSettingsSnapshot {
  const supported = getSupportedAudioConstraints();
  const settings = track.getSettings?.() ?? {};
  const capabilitiesRaw =
    typeof track.getCapabilities === "function" ? (track.getCapabilities() as Record<string, unknown>) : {};

  const warnings: string[] = [];
  let processingRisk: MicSettingsSnapshot["processingRisk"] = "low";

  const settingValues = [
    settings.echoCancellation,
    settings.noiseSuppression,
    settings.autoGainControl
  ] as Array<boolean | undefined>;

  if (settingValues.some((value) => value === true)) {
    processingRisk = "high";
    warnings.push("Mic processing appears enabled (echo cancellation/noise suppression/AGC). Results may be less reliable.");
  } else if (settingValues.some((value) => value === undefined)) {
    processingRisk = "unknown";
    warnings.push("Browser did not fully report mic processing state. Some processing may still be active.");
  }

  return {
    requested: REQUESTED_AUDIO_CONSTRAINTS,
    supported,
    settings,
    capabilities: capabilitiesRaw,
    processingRisk,
    warnings
  };
}

export async function startRecorder(options: RecorderOptions = {}): Promise<RecorderSession> {
  if (typeof window === "undefined") {
    throw new Error("Recorder is only available in the browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: REQUESTED_AUDIO_CONSTRAINTS,
    video: false
  });

  const track = stream.getAudioTracks()[0];

  if (!track) {
    throw new Error("No microphone track available.");
  }

  const micSettings = captureMicSettingsSnapshot(track);

  const audioContext = new AudioContext();
  const sampleRate = audioContext.sampleRate;
  const source = audioContext.createMediaStreamSource(stream);
  const mute = audioContext.createGain();
  mute.gain.value = 0;
  mute.connect(audioContext.destination);

  const chunks: Float32Array[] = [];
  const startedAt = performance.now();

  let cleanupNode: (() => void) | null = null;

  const pushChunk = (chunk: Float32Array) => {
    chunks.push(chunk);

    if (options.onChunk) {
      options.onChunk(chunk, {
        rms: rms(chunk),
        peak: peakAbs(chunk),
        elapsedSec: (performance.now() - startedAt) / 1000,
        sampleRate
      });
    }
  };

  try {
    await audioContext.audioWorklet.addModule(WORKLET_PROCESSOR_PATH);
    const worklet = new AudioWorkletNode(audioContext, "pcm-recorder-processor");
    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const data = event.data;
      if (!data?.length) {
        return;
      }

      const copy = new Float32Array(data.length);
      copy.set(data);
      pushChunk(copy);
    };

    source.connect(worklet);
    worklet.connect(mute);

    cleanupNode = () => {
      worklet.disconnect();
      source.disconnect();
    };
  } catch {
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(data.length);
      copy.set(data);
      pushChunk(copy);
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(mute);

    cleanupNode = () => {
      scriptProcessor.disconnect();
      source.disconnect();
    };
  }

  return {
    sampleRate,
    micSettings,
    stop: async () => {
      cleanupNode?.();
      track.stop();
      stream.getTracks().forEach((streamTrack) => streamTrack.stop());
      await audioContext.close();
      return concatFloat32(chunks);
    }
  };
}
