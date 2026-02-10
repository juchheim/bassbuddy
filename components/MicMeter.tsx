"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureMicSettingsSnapshot, REQUESTED_AUDIO_CONSTRAINTS } from "@/lib/audio/recorder";
import type { MicSettingsSnapshot } from "@/lib/types";
import styles from "@/components/MicMeter.module.css";

export type MicLevelStatus = "unknown" | "too-quiet" | "ok" | "clipping";

interface MicMeterProps {
  onSnapshot?: (snapshot: MicSettingsSnapshot | null) => void;
  onLevelStatus?: (status: MicLevelStatus) => void;
}

export function MicMeter({ onSnapshot, onLevelStatus }: MicMeterProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [levelStatus, setLevelStatus] = useState<MicLevelStatus>("unknown");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MicSettingsSnapshot | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsRunning(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: REQUESTED_AUDIO_CONSTRAINTS,
        video: false
      });

      const track = stream.getAudioTracks()[0];

      if (!track) {
        throw new Error("No audio track available.");
      }

      const settingsSnapshot = captureMicSettingsSnapshot(track);
      setSnapshot(settingsSnapshot);
      onSnapshot?.(settingsSnapshot);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const timeBuffer = new Float32Array(analyser.fftSize);
      let rafId = 0;

      const tick = () => {
        analyser.getFloatTimeDomainData(timeBuffer);

        let sumSquares = 0;
        let peak = 0;

        for (let i = 0; i < timeBuffer.length; i += 1) {
          const value = timeBuffer[i] ?? 0;
          sumSquares += value * value;
          peak = Math.max(peak, Math.abs(value));
        }

        const rms = Math.sqrt(sumSquares / timeBuffer.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-5));
        const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));

        let nextStatus: MicLevelStatus = "ok";

        if (peak > 0.98) {
          nextStatus = "clipping";
        } else if (db < -45) {
          nextStatus = "too-quiet";
        }

        setLevel(normalizedLevel);
        setLevelStatus(nextStatus);
        onLevelStatus?.(nextStatus);

        rafId = window.requestAnimationFrame(tick);
      };

      tick();
      setIsRunning(true);

      cleanupRef.current = () => {
        window.cancelAnimationFrame(rafId);
        source.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        void audioContext.close();
      };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Mic permission failed.";
      setError(message);
      setLevelStatus("unknown");
      onLevelStatus?.("unknown");
      onSnapshot?.(null);
    }
  }, [onLevelStatus, onSnapshot, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  let statusMessage = "Waiting for mic check.";
  let fillColor = "#7d8a98";

  if (levelStatus === "clipping") {
    statusMessage = "Too loud (clipping risk). Lower system volume slightly.";
    fillColor = "#9b2226";
  } else if (levelStatus === "too-quiet") {
    statusMessage = "Too quiet. Raise system volume or move closer to listening spot.";
    fillColor = "#a95000";
  } else if (levelStatus === "ok") {
    statusMessage = "Mic level looks usable.";
    fillColor = "#1f7a2f";
  }

  return (
    <div className={styles.wrap}>
      <button className="cta ctaSecondary" onClick={() => void start()} type="button">
        {isRunning ? "Re-check Mic" : "Enable Mic Check"}
      </button>

      <div className={styles.meter} aria-label="Mic level meter">
        <div className={styles.fill} style={{ width: `${Math.round(level * 100)}%`, background: fillColor }} />
      </div>

      <p className={styles.meta}>{statusMessage}</p>

      {snapshot?.warnings.length ? (
        <ul className={styles.warningList}>
          {snapshot.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="error">Mic error: {error}</p> : null}
    </div>
  );
}
