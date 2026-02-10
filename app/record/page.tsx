"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProgressStepper } from "@/components/ProgressStepper";
import { analyzeRun } from "@/lib/audio/analyzeRun";
import { detectBeep } from "@/lib/audio/beepDetect";
import { startRecorder, type RecorderSession } from "@/lib/audio/recorder";
import {
  buildToneSchedule,
  MANUAL_START_TIMEOUT_SEC,
  MAX_RECORD_SECONDS,
  TRACK_DURATION_AFTER_BEEP_SEC
} from "@/lib/constants/testTrack";
import { saveRun } from "@/lib/storage/runsStore";
import type { BassRun, RunMode } from "@/lib/types";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import styles from "@/app/record/record.module.css";

function concatFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Float32Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function getPlatform(): string {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform ?? nav.platform ?? "unknown";
}

export default function RecordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RunMode>("baseline");

  const [phase, setPhase] = useState<"idle" | "recording" | "processing">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [beepTimeSec, setBeepTimeSec] = useState<number | null>(null);
  const [manualHintSec, setManualHintSec] = useState<number | null>(null);
  const [usedManualStart, setUsedManualStart] = useState(false);
  const [peakLive, setPeakLive] = useState(0);
  const [rmsLive, setRmsLive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RecorderSession | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const lastScanSecRef = useRef(0);

  const beepTimeRef = useRef<number | null>(beepTimeSec);
  beepTimeRef.current = beepTimeSec;

  const manualHintRef = useRef<number | null>(manualHintSec);
  manualHintRef.current = manualHintSec;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(normalizeMode(params.get("mode")));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAndAnalyze = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }

    stoppingRef.current = true;
    stopTimer();

    const session = sessionRef.current;

    if (!session) {
      setPhase("idle");
      stoppingRef.current = false;
      return;
    }

    setPhase("processing");

    try {
      const samples = await session.stop();
      sessionRef.current = null;

      const hint = manualHintRef.current ?? beepTimeRef.current ?? undefined;
      const analysis = analyzeRun({
        samples,
        sampleRate: session.sampleRate,
        manualBeepTimeSec: hint
      });

      const notes: string[] = [];

      if (analysis.clippingLikely || peakLive > 0.98) {
        notes.push("Possible clipping detected. Consider reducing playback volume slightly.");
      }

      if (analysis.tooQuietLikely || rmsLive < 0.003) {
        notes.push("Signal level may be too quiet. Consider increasing playback volume.");
      }

      if (usedManualStart) {
        notes.push("Manual sync start used. Confidence may be lower.");
      }

      const run: BassRun = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        mode,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: getPlatform()
        },
        micSettings: session.micSettings,
        sampleRate: session.sampleRate,
        beepDetected: analysis.beepDetected,
        confidence: analysis.confidence,
        measurements: analysis.measurements,
        score: analysis.score,
        highlights: analysis.highlights,
        notes: notes.length ? notes.join(" ") : undefined
      };

      saveRun(run);
      router.push(`/results/${run.id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to analyze recording.";
      setError(message);
      setPhase("idle");
    } finally {
      stoppingRef.current = false;
    }
  }, [mode, peakLive, rmsLive, router, stopTimer, usedManualStart]);

  const beginRecording = useCallback(async () => {
    setError(null);
    setPhase("recording");
    setElapsedSec(0);
    setPeakLive(0);
    setRmsLive(0);
    setBeepTimeSec(null);
    setManualHintSec(null);
    setUsedManualStart(false);
    chunksRef.current = [];
    lastScanSecRef.current = 0;
    stoppingRef.current = false;

    try {
      const session = await startRecorder({
        onChunk: (chunk, meta) => {
          chunksRef.current.push(chunk);
          setPeakLive((prev) => Math.max(prev, meta.peak));
          setRmsLive(meta.rms);

          const knownBeep = beepTimeRef.current ?? manualHintRef.current;

          if (!knownBeep && meta.elapsedSec - lastScanSecRef.current > 1.0) {
            lastScanSecRef.current = meta.elapsedSec;
            const joined = concatFloat32(chunksRef.current);
            const detection = detectBeep(joined, meta.sampleRate);

            if (detection.detected) {
              setBeepTimeSec(detection.timeSec);
              setManualHintSec(detection.timeSec);
            }
          }

          const activeBeep = beepTimeRef.current ?? manualHintRef.current;

          if (activeBeep !== null && meta.elapsedSec >= activeBeep + TRACK_DURATION_AFTER_BEEP_SEC + 1.0) {
            void stopAndAnalyze();
          } else if (meta.elapsedSec >= MAX_RECORD_SECONDS) {
            void stopAndAnalyze();
          }
        }
      });

      sessionRef.current = session;
      startedAtRef.current = performance.now();

      timerRef.current = window.setInterval(() => {
        setElapsedSec((performance.now() - startedAtRef.current) / 1000);
      }, 120);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to access microphone.";
      setError(message);
      setPhase("idle");
    }
  }, [stopAndAnalyze]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (sessionRef.current) {
        void sessionRef.current.stop();
        sessionRef.current = null;
      }
    };
  }, [stopTimer]);

  const schedule = useMemo(() => {
    if (beepTimeSec === null) {
      return [];
    }

    return buildToneSchedule(beepTimeSec);
  }, [beepTimeSec]);

  const currentTone = schedule.find((segment) => elapsedSec >= segment.toneStartSec && elapsedSec <= segment.toneEndSec);

  let statusMessage = "Press Start Listening, then play the test track on your main system.";

  if (phase === "processing") {
    statusMessage = "Analyzing measurement...";
  } else if (phase === "recording") {
    if (currentTone) {
      statusMessage = `Measuring ${currentTone.freqHz} Hz`;
    } else if (beepTimeSec !== null) {
      statusMessage = "Sync beep aligned. Waiting for next tone step...";
    } else {
      statusMessage = "Waiting for sync beep...";
    }
  }

  const showManualStart = phase === "recording" && beepTimeSec === null && elapsedSec >= MANUAL_START_TIMEOUT_SEC;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Record</h1>
        <p className="muted">Mode: {modeTitle(mode)}</p>
      </header>

      <section className="panel">
        <p className={styles.status}>{statusMessage}</p>
        <p className={styles.metrics}>
          Elapsed: {elapsedSec.toFixed(1)}s | Peak: {(peakLive * 100).toFixed(0)}% | RMS: {(rmsLive * 100).toFixed(2)}%
        </p>
        {peakLive > 0.98 ? <p className="warning">Clipping risk detected. Consider slightly lower playback volume.</p> : null}
        {rmsLive > 0 && rmsLive < 0.003 ? <p className="warning">Input is very quiet. Measurement confidence may suffer.</p> : null}
        {usedManualStart ? <p className="warning">Manual sync start in use (lower confidence).</p> : null}
        {beepTimeSec !== null ? <ProgressStepper schedule={schedule} elapsedSec={elapsedSec} /> : null}
      </section>

      <section className={styles.controls} style={{ marginTop: 12 }}>
        {phase === "idle" ? (
          <button className="cta" type="button" onClick={() => void beginRecording()}>
            Start Listening
          </button>
        ) : null}

        {phase === "recording" ? (
          <button className="cta ctaDanger" type="button" onClick={() => void stopAndAnalyze()}>
            Stop and Analyze
          </button>
        ) : null}

        {showManualStart ? (
          <button
            className="cta ctaSecondary"
            type="button"
            onClick={() => {
              setManualHintSec(elapsedSec);
              setBeepTimeSec(elapsedSec);
              setUsedManualStart(true);
            }}
          >
            Manual Start (tap when beep plays)
          </button>
        ) : null}

        <Link href={`/setup?mode=${mode}`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
          Back to Setup
        </Link>
      </section>

      {error ? <p className="error" style={{ marginTop: 10 }}>{error}</p> : null}
    </main>
  );
}
