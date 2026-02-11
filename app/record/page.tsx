"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProgressStepper } from "@/components/ProgressStepper";
import { analyzeRun } from "@/lib/audio/analyzeRun";
import { detectBeep } from "@/lib/audio/beepDetect";
import { startRecorder, type RecorderSession } from "@/lib/audio/recorder";
import {
  advanceGuidedSession,
  clearGuidedSession,
  describeGuidedStep,
  getCurrentGuidedStep,
  getGuidedProgress,
  getGuidedSessionForMode,
  isGuidedSessionComplete,
  type GuidedSessionV1
} from "@/lib/storage/guidedSession";
import {
  buildToneSchedule,
  MANUAL_START_TIMEOUT_SEC,
  MAX_RECORD_SECONDS,
  TRACK_DURATION_AFTER_BEEP_SEC
} from "@/lib/constants/testTrack";
import { getRunById, saveRun } from "@/lib/storage/runsStore";
import { hasCompletedSetup } from "@/lib/storage/uiPrefs";
import type { BassRun, MicProcessingRisk, RunMode } from "@/lib/types";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import { assessQuickPreflight, evaluateRunQuality, evaluateVolumeDrift } from "@/lib/utils/runQuality";
import { median } from "@/lib/utils/math";
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

function runVolumeAnchor(run: BassRun): number {
  if (typeof run.volumeAnchorDb === "number") {
    return run.volumeAnchorDb;
  }

  if (typeof run.medianRawLevelDb === "number") {
    return run.medianRawLevelDb;
  }

  return median(run.measurements.map((measurement) => measurement.levelRaw));
}

const PREFLIGHT_DURATION_SEC = 10;

interface PreflightResult {
  grade: "pass" | "warn" | "fail";
  summary: string;
  warnings: string[];
  peak: number;
  meanRms: number;
  processingRisk: MicProcessingRisk;
}

export default function RecordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RunMode>("baseline");
  const [setupGate, setSetupGate] = useState<"checking" | "ready">("checking");

  const [phase, setPhase] = useState<"idle" | "recording" | "processing">("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [beepTimeSec, setBeepTimeSec] = useState<number | null>(null);
  const [manualHintSec, setManualHintSec] = useState<number | null>(null);
  const [usedManualStart, setUsedManualStart] = useState(false);
  const [peakLive, setPeakLive] = useState(0);
  const [rmsLive, setRmsLive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preflightState, setPreflightState] = useState<"idle" | "running" | "done">("idle");
  const [preflightSecondsLeft, setPreflightSecondsLeft] = useState(PREFLIGHT_DURATION_SEC);
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [guidedSession, setGuidedSession] = useState<GuidedSessionV1 | null>(null);
  const [guidedNotice, setGuidedNotice] = useState<string | null>(null);

  const sessionRef = useRef<RecorderSession | null>(null);
  const preflightSessionRef = useRef<RecorderSession | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const preflightTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const preflightStartedAtRef = useRef(0);
  const stoppingRef = useRef(false);
  const preflightStoppingRef = useRef(false);
  const lastScanSecRef = useRef(0);
  const preflightRmsSumRef = useRef(0);
  const preflightRmsCountRef = useRef(0);
  const preflightPeakRef = useRef(0);

  const beepTimeRef = useRef<number | null>(beepTimeSec);
  beepTimeRef.current = beepTimeSec;

  const manualHintRef = useRef<number | null>(manualHintSec);
  manualHintRef.current = manualHintSec;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = normalizeMode(params.get("mode"));
    setMode(nextMode);

    if (!hasCompletedSetup()) {
      router.replace(`/setup?mode=${nextMode}`);
      return;
    }

    setGuidedSession(getGuidedSessionForMode(nextMode));
    setSetupGate("ready");
  }, [router]);

  useEffect(() => {
    if (setupGate !== "ready") {
      return;
    }

    setGuidedSession(getGuidedSessionForMode(mode));
  }, [mode, setupGate]);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopPreflightTimer = useCallback(() => {
    if (preflightTimerRef.current !== null) {
      window.clearInterval(preflightTimerRef.current);
      preflightTimerRef.current = null;
    }
  }, []);

  const finishQuickPreflight = useCallback(async () => {
    if (preflightStoppingRef.current) {
      return;
    }

    preflightStoppingRef.current = true;
    stopPreflightTimer();

    const session = preflightSessionRef.current;
    if (!session) {
      setPreflightState("idle");
      setPreflightSecondsLeft(PREFLIGHT_DURATION_SEC);
      preflightStoppingRef.current = false;
      return;
    }

    try {
      await session.stop();
      preflightSessionRef.current = null;

      const meanRms =
        preflightRmsCountRef.current > 0 ? preflightRmsSumRef.current / preflightRmsCountRef.current : 0;
      const peak = preflightPeakRef.current;

      const assessment = assessQuickPreflight({
        peak,
        meanRms,
        micProcessingRisk: session.micSettings.processingRisk
      });

      setPreflightResult({
        ...assessment,
        peak,
        meanRms,
        processingRisk: session.micSettings.processingRisk
      });
      setPreflightState("done");
      setPreflightSecondsLeft(0);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Quick preflight failed.";
      setPreflightError(message);
      setPreflightState("idle");
      setPreflightSecondsLeft(PREFLIGHT_DURATION_SEC);
    } finally {
      preflightStoppingRef.current = false;
    }
  }, [stopPreflightTimer]);

  const startQuickPreflight = useCallback(async () => {
    if (phase !== "idle" || preflightState === "running") {
      return;
    }

    setError(null);
    setPreflightError(null);
    setPreflightResult(null);
    setPreflightState("running");
    setPreflightSecondsLeft(PREFLIGHT_DURATION_SEC);
    preflightRmsSumRef.current = 0;
    preflightRmsCountRef.current = 0;
    preflightPeakRef.current = 0;
    preflightStoppingRef.current = false;
    preflightStartedAtRef.current = performance.now();

    try {
      const session = await startRecorder({
        onChunk: (_chunk, meta) => {
          preflightPeakRef.current = Math.max(preflightPeakRef.current, meta.peak);
          preflightRmsSumRef.current += meta.rms;
          preflightRmsCountRef.current += 1;

          const elapsedSec = (performance.now() - preflightStartedAtRef.current) / 1000;
          setPreflightSecondsLeft(Math.max(0, PREFLIGHT_DURATION_SEC - elapsedSec));

          if (elapsedSec >= PREFLIGHT_DURATION_SEC) {
            void finishQuickPreflight();
          }
        }
      });

      preflightSessionRef.current = session;

      preflightTimerRef.current = window.setInterval(() => {
        const elapsedSec = (performance.now() - preflightStartedAtRef.current) / 1000;
        setPreflightSecondsLeft(Math.max(0, PREFLIGHT_DURATION_SEC - elapsedSec));

        if (elapsedSec >= PREFLIGHT_DURATION_SEC) {
          void finishQuickPreflight();
        }
      }, 150);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to run quick preflight.";
      setPreflightError(message);
      setPreflightState("idle");
      setPreflightSecondsLeft(PREFLIGHT_DURATION_SEC);
    }
  }, [finishQuickPreflight, phase, preflightState]);

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
      const activeGuidedSession = getGuidedSessionForMode(mode);
      const guidedStep = activeGuidedSession ? getCurrentGuidedStep(activeGuidedSession) : null;
      const previousGuidedRuns = (activeGuidedSession?.runIds ?? [])
        .map((runId) => getRunById(runId))
        .filter((entry): entry is BassRun => Boolean(entry));

      const notes: string[] = [];
      let quality = evaluateRunQuality({
        confidence: analysis.confidence,
        beepDetected: analysis.beepDetected,
        clippingLikely: analysis.clippingLikely || peakLive > 0.98,
        tooQuietLikely: analysis.tooQuietLikely || rmsLive < 0.003,
        micProcessingRisk: session.micSettings.processingRisk,
        peakDbfs: analysis.peakDbfs,
        overallRmsDbfs: analysis.overallRmsDbfs,
        beepToneLevelDb: analysis.beepToneLevelDb
      });

      let volumeDriftDb: number | undefined;

      if (previousGuidedRuns.length) {
        const referenceAnchorDb = median(previousGuidedRuns.map((run) => runVolumeAnchor(run)));
        const drift = evaluateVolumeDrift(referenceAnchorDb, analysis.volumeAnchorDb);
        volumeDriftDb = drift.deltaDb;

        if (drift.severity === "block") {
          quality = {
            ...quality,
            blocking: true,
            issues: [...quality.issues, `Volume drift too high vs session reference (${drift.deltaDb.toFixed(1)} dB).`]
          };
          notes.push(
            `Session volume drift is high (${drift.deltaDb.toFixed(1)} dB). Re-run at matched playback level.`
          );
        } else if (drift.severity === "warn") {
          quality = {
            ...quality,
            issues: [...quality.issues, `Volume drift warning vs session reference (${drift.deltaDb.toFixed(1)} dB).`]
          };
          notes.push(`Volume drift warning (${drift.deltaDb.toFixed(1)} dB) compared with earlier guided captures.`);
        }
      }

      if (analysis.clippingLikely || peakLive > 0.98) {
        notes.push("Possible clipping detected. Consider reducing playback volume slightly.");
      }

      if (analysis.tooQuietLikely || rmsLive < 0.003) {
        notes.push("Signal level may be too quiet. Consider increasing playback volume.");
      }

      if (usedManualStart) {
        notes.push("Manual sync start used. Confidence may be lower.");
      }

      if (guidedStep) {
        notes.push(`Guided session step captured: ${describeGuidedStep(guidedStep)}.`);
      }

      if (quality.blocking) {
        notes.push("Run quality is poor. Re-run this measurement before making placement decisions.");
      }

      const run: BassRun = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        mode,
        sessionId: activeGuidedSession?.id,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: getPlatform()
        },
        micSettings: session.micSettings,
        sampleRate: session.sampleRate,
        beepDetected: analysis.beepDetected,
        confidence: analysis.confidence,
        label: guidedStep?.label,
        measurements: analysis.measurements,
        score: analysis.score,
        highlights: analysis.highlights,
        quality,
        medianRawLevelDb: analysis.medianRawDb,
        beepToneLevelDb: analysis.beepToneLevelDb,
        volumeAnchorDb: analysis.volumeAnchorDb,
        volumeDriftDb,
        notes: notes.length ? notes.join(" ") : undefined
      };

      saveRun(run);
      if (guidedStep) {
        const nextGuided = advanceGuidedSession(run.id);
        if (nextGuided && nextGuided.mode === mode) {
          setGuidedSession(nextGuided);
        } else {
          setGuidedSession(getGuidedSessionForMode(mode));
        }
      }
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
    if (preflightState === "running") {
      setError("Quick preflight is still running. Wait for it to finish before starting measurement.");
      return;
    }

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
  }, [preflightState, stopAndAnalyze]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopPreflightTimer();
      if (sessionRef.current) {
        void sessionRef.current.stop();
        sessionRef.current = null;
      }
      if (preflightSessionRef.current) {
        void preflightSessionRef.current.stop();
        preflightSessionRef.current = null;
      }
    };
  }, [stopPreflightTimer, stopTimer]);

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
  const guidedProgress = guidedSession ? getGuidedProgress(guidedSession) : null;
  const guidedComplete = guidedSession ? isGuidedSessionComplete(guidedSession) : false;
  const guidedStep = guidedSession ? getCurrentGuidedStep(guidedSession) : null;

  if (setupGate === "checking") {
    return (
      <main className="pageContainer">
        <section className="panel">
          <p className="muted">Checking setup status...</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            If this is your first run on this device, you will be redirected to Setup.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Record</h1>
        <p className="muted">Mode: {modeTitle(mode)}</p>
      </header>

      {guidedSession ? (
        <section className={`${styles.guidedPanel} panel`}>
          <h2 className={styles.guidedTitle}>Guided Session Active</h2>
          <p className={styles.guidedText}>
            Progress: {guidedProgress?.completed ?? 0}/{guidedProgress?.total ?? 0}
          </p>
          {!guidedComplete && guidedStep ? (
            <p className={styles.guidedText}>Next capture: {describeGuidedStep(guidedStep)}</p>
          ) : (
            <p className="ok" style={{ margin: 0 }}>
              Guided session complete. You can open compare after this run.
            </p>
          )}
          <div className={styles.guidedActions}>
            <button
              type="button"
              className="cta ctaSecondary"
              onClick={() => {
                clearGuidedSession();
                setGuidedSession(null);
                setGuidedNotice("Guided session cleared.");
              }}
              disabled={phase !== "idle"}
            >
              Clear Guided Session
            </button>
            {guidedComplete ? (
              <Link href={`/compare?mode=${mode}`} className="cta" style={{ textAlign: "center" }}>
                Open Compare
              </Link>
            ) : null}
          </div>
          {guidedNotice ? <p className="muted" style={{ margin: 0 }}>{guidedNotice}</p> : null}
        </section>
      ) : null}

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
          <div className={styles.preflightPanel}>
            <p className={styles.preflightTitle}>Quick Preflight (optional, 10s)</p>
            <p className={styles.preflightText}>
              Runs a fast mic-level sanity check before measurement. Helpful when room/device conditions changed.
            </p>
            <button
              className="cta ctaSecondary"
              type="button"
              onClick={() => void startQuickPreflight()}
              disabled={preflightState === "running"}
            >
              {preflightState === "running"
                ? `Running Preflight... ${Math.ceil(preflightSecondsLeft)}s`
                : "Run Quick Preflight"}
            </button>
            {preflightResult ? (
              <div className={styles.preflightSummary}>
                <p className={preflightResult.grade === "pass" ? "ok" : preflightResult.grade === "fail" ? "error" : "warning"}>
                  {preflightResult.summary}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  Peak {(preflightResult.peak * 100).toFixed(1)}% | RMS {(preflightResult.meanRms * 100).toFixed(2)}% | Mic
                  processing {preflightResult.processingRisk}
                </p>
                {preflightResult.warnings.map((warning) => (
                  <p className="warning" key={warning} style={{ margin: 0 }}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            {preflightError ? <p className="error" style={{ margin: 0 }}>{preflightError}</p> : null}
          </div>
        ) : null}

        {phase === "idle" ? (
          <button className="cta" type="button" onClick={() => void beginRecording()} disabled={preflightState === "running"}>
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
          Open Setup Checks
        </Link>
      </section>

      {error ? <p className="error" style={{ marginTop: 10 }}>{error}</p> : null}
    </main>
  );
}
