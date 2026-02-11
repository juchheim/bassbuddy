"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Checklist, type ChecklistItem } from "@/components/Checklist";
import { MicMeter, type MicLevelStatus } from "@/components/MicMeter";
import {
  clearGuidedSession,
  describeGuidedStep,
  getCurrentGuidedStep,
  getGuidedProgress,
  getGuidedSessionForMode,
  isGuidedSessionComplete,
  startGuidedSession,
  type GuidedSessionV1
} from "@/lib/storage/guidedSession";
import { getUiPrefs, markSetupCompleted } from "@/lib/storage/uiPrefs";
import { clampScoutCandidates, SCOUT_DEFAULT_CANDIDATES } from "@/lib/constants/scout";
import type { MicSettingsSnapshot, RunMode } from "@/lib/types";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import styles from "@/app/setup/setup.module.css";

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "seat",
    label: "Place phone/laptop at the listening position with mic unobstructed."
  },
  {
    id: "volume",
    label: "Keep playback volume constant between all runs."
  },
  {
    id: "processing",
    label: "Turn off voice isolation/noise filtering modes if available."
  }
];

export default function SetupPage() {
  const router = useRouter();

  const [mode, setMode] = useState<RunMode>("baseline");

  const [checks, setChecks] = useState<Record<string, boolean>>({
    seat: false,
    volume: false,
    processing: false
  });

  const [micSnapshot, setMicSnapshot] = useState<MicSettingsSnapshot | null>(null);
  const [levelStatus, setLevelStatus] = useState<MicLevelStatus>("unknown");

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [setupCompletedAt, setSetupCompletedAt] = useState<string | undefined>(undefined);
  const [forceFullSetup, setForceFullSetup] = useState(false);
  const [guidedSession, setGuidedSession] = useState<GuidedSessionV1 | null>(null);
  const [guidedNotice, setGuidedNotice] = useState<string | null>(null);
  const [scoutCandidateCount, setScoutCandidateCount] = useState(SCOUT_DEFAULT_CANDIDATES);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = normalizeMode(params.get("mode"));
    const advancedRequested =
      params.get("advanced") === "1" || nextMode === "multiseat" || nextMode === "scout";
    setMode(nextMode);
    setShowAdvancedTools(advancedRequested);

    const prefs = getUiPrefs();
    setSetupCompleted(prefs.setupCompleted);
    setSetupCompletedAt(prefs.setupCompletedAt);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) {
      return;
    }

    setGuidedSession(getGuidedSessionForMode(mode));
  }, [mode, prefsLoaded]);

  useEffect(() => {
    if (guidedSession?.mode === "scout") {
      setScoutCandidateCount(clampScoutCandidates(guidedSession.repeatsPerSide));
    }
  }, [guidedSession]);

  const allChecked = useMemo(() => CHECKLIST_ITEMS.every((item) => Boolean(checks[item.id])), [checks]);
  const needsFullSetup = !setupCompleted || forceFullSetup;
  const canContinue = needsFullSetup ? allChecked && micSnapshot !== null && levelStatus !== "unknown" : true;
  const guidedSupported = mode === "ab" || mode === "phase" || mode === "multiseat" || mode === "scout";
  const guidedProgress = guidedSession ? getGuidedProgress(guidedSession) : null;
  const guidedComplete = guidedSession ? isGuidedSessionComplete(guidedSession) : false;
  const nextGuidedStep = guidedSession ? getCurrentGuidedStep(guidedSession) : null;

  const completedAtDisplay = setupCompletedAt ? new Date(setupCompletedAt).toLocaleString() : "Unknown";

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Setup</h1>
        <p className="muted">Mode: {modeTitle(mode)}</p>
      </header>

      {!prefsLoaded ? (
        <section className="panel">
          <p className="muted">Loading setup preferences...</p>
        </section>
      ) : null}

      {prefsLoaded && !needsFullSetup ? (
        <>
          <section className={`panel ${styles.row}`}>
            <h2>Quick Start Ready</h2>
            <p className={styles.note}>
              Checklist and mic preflight were already completed on this device. You can go straight to recording.
            </p>
            <p className="muted" style={{ margin: 0 }}>Last completed: {completedAtDisplay}</p>
            <div className={styles.links}>
              <button
                className="cta"
                type="button"
                onClick={() => {
                  router.push(`/record?mode=${mode}`);
                }}
              >
                Continue to Record
              </button>
              <button
                className="cta ctaSecondary"
                type="button"
                onClick={() => {
                  setForceFullSetup(true);
                  setChecks({ seat: false, volume: false, processing: false });
                  setMicSnapshot(null);
                  setLevelStatus("unknown");
                }}
              >
                Run Full Setup Again
              </button>
            </div>
          </section>

          <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
            <h2>Test Track</h2>
            <p className={styles.note}>
              Recommended workflow: play this track on your main system while recording here.
            </p>
            <div className={styles.links}>
              <Link href="/test-track" className="cta ctaSecondary" style={{ textAlign: "center" }}>
                Open Test Track
              </Link>
              <a href="/test-tracks/bassbuddy_mvp.wav" className="cta ctaSecondary" download style={{ textAlign: "center" }}>
                Download WAV Test Track
              </a>
            </div>
          </section>
        </>
      ) : null}

      {prefsLoaded && needsFullSetup ? (
        <>
          <section className={`panel ${styles.row}`}>
            <h2>{setupCompleted ? "Re-run Setup Checks" : "First-Time Setup (Required Once)"}</h2>
            <Checklist
              items={CHECKLIST_ITEMS}
              values={checks}
              onToggle={(id, checked) => setChecks((prev) => ({ ...prev, [id]: checked }))}
            />
          </section>

          <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
            <h2>Mic Level Check</h2>
            <p className={styles.note}>
              We request echo cancellation, noise suppression, and auto-gain control off. Browser/device behavior varies.
            </p>
            <MicMeter onSnapshot={setMicSnapshot} onLevelStatus={setLevelStatus} />
          </section>

          <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
            <h2>Test Track</h2>
            <p className={styles.note}>
              Recommended workflow: play this track on your main system while recording here.
            </p>
            <div className={styles.links}>
              <Link href="/test-track" className="cta ctaSecondary" style={{ textAlign: "center" }}>
                Open Test Track
              </Link>
              <a href="/test-tracks/bassbuddy_mvp.wav" className="cta ctaSecondary" download style={{ textAlign: "center" }}>
                Download WAV Test Track
              </a>
            </div>
          </section>

          <section style={{ marginTop: 12 }}>
            <button
              className="cta"
              type="button"
              disabled={!canContinue}
              onClick={() => {
                const prefs = markSetupCompleted();
                setSetupCompleted(true);
                setSetupCompletedAt(prefs.setupCompletedAt);
                setForceFullSetup(false);
                router.push(`/record?mode=${mode}`);
              }}
            >
              Save Setup and Continue to Record
            </button>
          </section>

          {!canContinue ? (
            <p className="warning" style={{ marginTop: 8 }}>
              Complete checklist and run mic check before continuing.
            </p>
          ) : null}
        </>
      ) : null}

      {prefsLoaded && guidedSupported && showAdvancedTools ? (
        <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
          <h2>{mode === "scout" ? "Placement Scout Session" : "Guided Repeatability Session"}</h2>
          <p className={styles.note}>
            {mode === "multiseat"
              ? "Auto-label and sequence captures as Placement A/B across Center, Left, and Right seats."
              : mode === "scout"
              ? "Capture 4-8 candidate sub locations in one guided pass. Compare mode will auto-rank and promote top picks."
              : "Auto-label and sequence captures as A1/A2/A3 then B1/B2/B3 (or phase equivalents) to reduce compare errors."}
          </p>
          {needsFullSetup ? (
            <p className="warning" style={{ margin: 0 }}>
              Complete setup first to enable guided capture.
            </p>
          ) : (
            <>
              {guidedSession ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    Progress: {guidedProgress?.completed ?? 0}/{guidedProgress?.total ?? 0}
                  </p>
                  {!guidedComplete && nextGuidedStep ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Next step: {describeGuidedStep(nextGuidedStep)}
                    </p>
                  ) : (
                    <p className="ok" style={{ margin: 0 }}>
                      Guided session complete. Open Compare to review results.
                    </p>
                  )}
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  No active guided session in this mode.
                </p>
              )}
              <div className={styles.links}>
                {guidedSession && !guidedComplete ? (
                  <button
                    className="cta"
                    type="button"
                    onClick={() => {
                      router.push(`/record?mode=${mode}`);
                    }}
                  >
                    Resume Guided Session
                  </button>
                ) : null}
                {mode === "scout" ? (
                  <>
                    <label>
                      Candidate count (4-8)
                      <select
                        value={scoutCandidateCount}
                        onChange={(event) => setScoutCandidateCount(clampScoutCandidates(Number(event.target.value)))}
                      >
                        <option value={4}>4 candidates</option>
                        <option value={5}>5 candidates</option>
                        <option value={6}>6 candidates</option>
                        <option value={7}>7 candidates</option>
                        <option value={8}>8 candidates</option>
                      </select>
                    </label>
                    <button
                      className="cta ctaSecondary"
                      type="button"
                      onClick={() => {
                        if (guidedSession && !window.confirm("Start a new scout session and replace current progress?")) {
                          return;
                        }

                        const next = startGuidedSession("scout", scoutCandidateCount);
                        setGuidedSession(next);
                        setGuidedNotice(`Scout session started (${next.steps.length} candidate locations).`);
                        router.push(`/record?mode=${mode}`);
                      }}
                    >
                      Start Placement Scout
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="cta ctaSecondary"
                      type="button"
                      onClick={() => {
                        if (guidedSession && !window.confirm("Start a new guided session and replace current progress?")) {
                          return;
                        }

                        const next = startGuidedSession(mode as "ab" | "phase" | "multiseat", mode === "multiseat" ? 1 : 2);
                        setGuidedSession(next);
                        setGuidedNotice(
                          mode === "multiseat"
                            ? "Guided multi-seat session started (A/B across center/left/right)."
                            : "Guided session started (2 runs per side)."
                        );
                        router.push(`/record?mode=${mode}`);
                      }}
                    >
                      {mode === "multiseat" ? "Start Guided Multi-Seat Session" : "Start Guided Session (2x per side)"}
                    </button>
                    {mode !== "multiseat" ? (
                      <button
                        className="cta ctaSecondary"
                        type="button"
                        onClick={() => {
                          if (guidedSession && !window.confirm("Start a new guided session and replace current progress?")) {
                            return;
                          }

                          const next = startGuidedSession(mode as "ab" | "phase", 3);
                          setGuidedSession(next);
                          setGuidedNotice("Guided session started (3 runs per side).");
                          router.push(`/record?mode=${mode}`);
                        }}
                      >
                        Start Guided Session (3x per side)
                      </button>
                    ) : null}
                  </>
                )}
                {guidedSession ? (
                  <button
                    className="cta ctaDanger"
                    type="button"
                    onClick={() => {
                      if (!window.confirm("End and clear the current guided session?")) {
                        return;
                      }

                      clearGuidedSession();
                      setGuidedSession(null);
                      setGuidedNotice("Guided session cleared.");
                    }}
                  >
                    Clear Guided Session
                  </button>
                ) : null}
                {guidedComplete ? (
                  <Link href={`/advanced/compare?mode=${mode}`} className="cta" style={{ textAlign: "center" }}>
                    Open Compare
                  </Link>
                ) : null}
              </div>
            </>
          )}
          {guidedNotice ? <p className="muted" style={{ margin: 0 }}>{guidedNotice}</p> : null}
        </section>
      ) : null}

      {prefsLoaded && guidedSupported && !showAdvancedTools ? (
        <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
          <h2>Need More Control?</h2>
          <p className={styles.note}>
            Guided repeatability sessions, multi-seat compromise, and scout workflows are available in Advanced Tools.
          </p>
          <div className={styles.links}>
            <Link href={`/setup?mode=${mode}&advanced=1`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
              Open Advanced Setup
            </Link>
            <Link href="/advanced" className="cta ctaSecondary" style={{ textAlign: "center" }}>
              Open Advanced Tools
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
