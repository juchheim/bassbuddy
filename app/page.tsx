"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModeCard } from "@/components/ModeCard";
import { SessionTools } from "@/components/SessionTools";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";
import { listDecisionSnapshots } from "@/lib/storage/decisionSnapshots";
import {
  archiveExperimentSession,
  createExperimentSession,
  getActiveExperimentSessionId,
  listExperimentSessions,
  restoreExperimentSession,
  setActiveExperimentSession,
  type ExperimentSession
} from "@/lib/storage/experimentSessions";
import { listRuns } from "@/lib/storage/runsStore";
import { hasCompletedSetup } from "@/lib/storage/uiPrefs";
import type { RunMode } from "@/lib/types";
import { buildDecisionReport, compareDecisionReports } from "@/lib/utils/decisionAssistant";
import styles from "@/app/page.module.css";

function startHref(mode: RunMode, setupCompleted: boolean): string {
  if (setupCompleted) {
    return `/record?mode=${mode}`;
  }

  return `/setup?mode=${mode}`;
}

export default function HomePage() {
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [sessions, setSessions] = useState<ExperimentSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<ExperimentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    setSetupCompleted(hasCompletedSetup());
    setPrefsLoaded(true);

    const availableSessions = listExperimentSessions();
    const hiddenSessions = listExperimentSessions({ archivedOnly: true });
    setSessions(availableSessions);
    setArchivedSessions(hiddenSessions);

    if (!availableSessions.length) {
      setActiveSessionId("");
      return;
    }

    const currentActive = getActiveExperimentSessionId();
    const resolvedSessionId = availableSessions.some((session) => session.id === currentActive)
      ? currentActive
      : availableSessions[0].id;

    setActiveExperimentSession(resolvedSessionId);
    setActiveSessionId(resolvedSessionId);
  }, [refreshTick]);

  useEffect(() => {
    const handleRefresh = () => setRefreshTick((value) => value + 1);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleRefresh();
      }
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const statusText = useMemo(() => {
    if (!prefsLoaded) {
      return "Checking setup status...";
    }

    return setupCompleted
      ? "Quick Start enabled: checklist + mic check already completed on this device."
      : "First-time setup required: complete checklist + mic check once to unlock Quick Start.";
  }, [prefsLoaded, setupCompleted]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );
  const sessionRuns = useMemo(
    () => (activeSessionId ? listRuns(undefined, activeSessionId) : []),
    [activeSessionId, refreshTick]
  );

  const runCounts = useMemo(() => {
    if (!activeSessionId) {
      return {
        baseline: 0,
        ab: 0,
        phase: 0,
        multiseat: 0,
        scout: 0,
        total: 0
      };
    }

    return {
      baseline: listRuns("baseline", activeSessionId).length,
      ab: listRuns("ab", activeSessionId).length,
      phase: listRuns("phase", activeSessionId).length,
      multiseat: listRuns("multiseat", activeSessionId).length,
      scout: listRuns("scout", activeSessionId).length,
      total: listRuns(undefined, activeSessionId).length
    };
  }, [activeSessionId, refreshTick]);
  const sessionReport = useMemo(() => buildDecisionReport(sessionRuns), [sessionRuns]);
  const sessionSnapshots = useMemo(
    () => (activeSessionId ? listDecisionSnapshots(activeSessionId) : []),
    [activeSessionId, refreshTick]
  );
  const confidenceTrend = useMemo(() => {
    if (!sessionSnapshots.length) {
      return {
        direction: "flat" as const,
        text: "No decision snapshots yet. Save one in Decision Assistant to track trend."
      };
    }

    if (sessionSnapshots.length >= 2) {
      const latest = sessionSnapshots[0];
      const previous = sessionSnapshots[1];
      const delta = compareDecisionReports(previous.report, latest.report);
      const direction = delta.overallScoreDelta > 1 ? "up" : delta.overallScoreDelta < -1 ? "down" : "flat";

      return {
        direction,
        text: `Latest snapshot trend: ${delta.overallScoreDelta >= 0 ? "+" : ""}${delta.overallScoreDelta.toFixed(1)} points vs previous snapshot.`
      };
    }

    const baseline = sessionSnapshots[0];
    const delta = compareDecisionReports(baseline.report, sessionReport);
    const direction = delta.overallScoreDelta > 1 ? "up" : delta.overallScoreDelta < -1 ? "down" : "flat";

    return {
      direction,
      text: `Current report vs latest snapshot: ${delta.overallScoreDelta >= 0 ? "+" : ""}${delta.overallScoreDelta.toFixed(1)} points.`
    };
  }, [sessionReport, sessionSnapshots]);

  const compareHref = useMemo(() => {
    const params = new URLSearchParams({ mode: "ab" });

    if (activeSessionId) {
      params.set("session", activeSessionId);
    }

    return `/compare?${params.toString()}`;
  }, [activeSessionId]);

  const runCountLabel = (count: number) => `${count} run${count === 1 ? "" : "s"} in active session`;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Sub Placement Coach</h1>
        <p className={styles.subtitle}>
          Fast, repeatable relative bass checks using your phone or laptop microphone.
        </p>
      </header>

      <section className={`panel ${styles.setupStatus}`}>
        <h2 className={styles.sectionTitle}>Setup Status</h2>
        <p className="muted">{statusText}</p>
        <div className={styles.quickActions}>
          <Link href="/setup?mode=baseline" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Run Setup Checks
          </Link>
          <Link href="/test-track" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Test Track
          </Link>
        </div>
      </section>

      <section className={`panel ${styles.sessionPanel}`}>
        <h2 className={styles.sectionTitle}>Active Experiment Session</h2>
        <p className="muted">
          Home, compare, and decision views now focus on one experiment session at a time.
        </p>
        <div className={styles.sessionControls}>
          <label>
            Session
            <select
              value={activeSessionId}
              onChange={(event) => {
                const nextSessionId = event.target.value;

                if (!setActiveExperimentSession(nextSessionId)) {
                  return;
                }

                setActiveSessionId(nextSessionId);
                setSessionMessage("Switched active experiment session.");
                setRefreshTick((value) => value + 1);
              }}
            >
              {sessions.map((session) => (
                <option value={session.id} key={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="cta ctaSecondary"
            onClick={() => {
              const created = createExperimentSession("");
              setSessionMessage(`Created and switched to "${created.name}".`);
              setRefreshTick((value) => value + 1);
            }}
          >
            New Session
          </button>
          <button
            type="button"
            className="cta ctaSecondary"
            disabled={!activeSession || activeSession.id === DEFAULT_EXPERIMENT_SESSION_ID}
            onClick={() => {
              if (!activeSession) {
                return;
              }

              const scopedRuns = listRuns(undefined, activeSession.id).length;
              const confirmed = window.confirm(
                `Archive "${activeSession.name}"? This hides it from selectors but keeps ${scopedRuns} saved run${scopedRuns === 1 ? "" : "s"}.`
              );

              if (!confirmed) {
                return;
              }

              const archived = archiveExperimentSession(activeSession.id);

              if (!archived) {
                setSessionMessage("Unable to archive this session.");
                return;
              }

              const nextName =
                listExperimentSessions().find((session) => session.id === archived.nextActiveSessionId)?.name ??
                "another session";
              setSessionMessage(`Archived "${activeSession.name}". Active session switched to "${nextName}".`);
              setRefreshTick((value) => value + 1);
            }}
          >
            Archive Session
          </button>
        </div>
        <p className="muted">
          Active session: <strong>{activeSession?.name ?? "Not selected"}</strong> ({runCountLabel(runCounts.total)}).
        </p>
        {activeSession?.id === DEFAULT_EXPERIMENT_SESSION_ID ? (
          <p className="muted">Default Session cannot be archived.</p>
        ) : null}
        {archivedSessions.length ? (
          <div className={styles.archivedPanel}>
            <button
              type="button"
              className="cta ctaSecondary"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? "Hide Archived Sessions" : `Show Archived Sessions (${archivedSessions.length})`}
            </button>
            {showArchived ? (
              <ul className={styles.archivedList}>
                {archivedSessions.map((session) => (
                  <li key={session.id} className={styles.archivedItem}>
                    <span className="muted">{session.name}</span>
                    <button
                      type="button"
                      className="cta ctaSecondary"
                      onClick={() => {
                        const restored = restoreExperimentSession(session.id);

                        if (!restored) {
                          setSessionMessage("Unable to restore archived session.");
                          return;
                        }

                        setSessionMessage(`Restored "${restored.name}".`);
                        setRefreshTick((value) => value + 1);
                      }}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {sessionMessage ? <p className="muted">{sessionMessage}</p> : null}
      </section>

      <section className={`panel ${styles.summaryPanel}`}>
        <h2 className={styles.sectionTitle}>Session Summary</h2>
        <p className="muted">
          Best A/B result: <strong>{sessionReport.placement.winner ?? "No winner yet"}</strong>
        </p>
        <p className="muted">
          Best phase result: <strong>{sessionReport.phase.winner ?? "No winner yet"}</strong>
        </p>
        <p
          className={
            confidenceTrend.direction === "up"
              ? "ok"
              : confidenceTrend.direction === "down"
              ? "warning"
              : "muted"
          }
        >
          Confidence trend: {confidenceTrend.text}
        </p>
        <p className="muted">
          Current confidence: {sessionReport.overallConfidence.toUpperCase()} ({sessionReport.overallScore}/100)
        </p>
        <div className={styles.quickActions}>
          <Link href="/decision" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Decision Assistant
          </Link>
          <Link href={compareHref} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Compare
          </Link>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 12 }}>
        <ModeCard
          title="Quick Baseline Measurement"
          description="Capture one run at your seat and see the response curve + smoothness score."
          href={startHref("baseline", setupCompleted)}
          cta={setupCompleted ? "Start Baseline" : "Open Setup"}
          meta={runCountLabel(runCounts.baseline)}
        />
        <ModeCard
          title="Compare Two Placements (A/B)"
          description="Measure placement A and B, then get a clear winner based on smoothness and dips."
          href={startHref("ab", setupCompleted)}
          cta={setupCompleted ? "Start A/B" : "Open Setup"}
          meta={runCountLabel(runCounts.ab)}
        />
        <ModeCard
          title="Phase Test (0 vs 180)"
          description="Measure with phase switch at 0° and 180° and choose the better setting."
          href={startHref("phase", setupCompleted)}
          cta={setupCompleted ? "Start Phase Test" : "Open Setup"}
          meta={runCountLabel(runCounts.phase)}
        />
        <ModeCard
          title="Multi-Seat Compromise (A/B)"
          description="Measure center/left/right seats for A and B, then pick the better compromise."
          href={startHref("multiseat", setupCompleted)}
          cta={setupCompleted ? "Start Multi-Seat" : "Open Setup"}
          meta={runCountLabel(runCounts.multiseat)}
        />
        <ModeCard
          title="Placement Scout (4-8 Candidates)"
          description="Measure several candidate sub locations, auto-rank them, then promote the top two into A/B."
          href={startHref("scout", setupCompleted)}
          cta={setupCompleted ? "Start Placement Scout" : "Open Setup"}
          meta={runCountLabel(runCounts.scout)}
        />
        <ModeCard
          title="Review Saved Runs"
          description="Open compare view to overlay existing runs and re-check decisions."
          href={compareHref}
          cta="Open Compare"
          meta={runCountLabel(runCounts.total)}
        />
        <ModeCard
          title="Final Decision Assistant"
          description="Combine all evidence into one recommendation with confidence and next actions."
          href="/decision"
          cta="Open Decision Assistant"
          meta={`${runCounts.total} run${runCounts.total === 1 ? "" : "s"} available for decision evidence.`}
        />
      </section>

      <section className={`panel ${styles.disclaimer}`}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <p className="muted">
          Play the SubSpot test track on your main system while this app listens at the seat mic. SubSpot aligns
          to the sync beep, measures each bass tone step, then shows relative dB smoothness.
        </p>
        <ul className={styles.list}>
          <li>Relative measurement only: not calibrated SPL.</li>
          <li>Keep playback volume and mic position identical between runs.</li>
          <li>Consumer mic processing can affect results even when we request it off.</li>
        </ul>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2 className={styles.sectionTitle}>Session Tools</h2>
        <p className="muted">
          Start fresh, export your local runs to JSON backup, or import a saved run set (merge or replace).
        </p>
        <SessionTools onChanged={() => setRefreshTick((value) => value + 1)} />
      </section>
    </main>
  );
}
