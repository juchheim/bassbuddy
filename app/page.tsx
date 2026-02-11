"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModeCard } from "@/components/ModeCard";
import { SessionTools } from "@/components/SessionTools";
import {
  createExperimentSession,
  getActiveExperimentSessionId,
  listExperimentSessions,
  setActiveExperimentSession,
  type ExperimentSession
} from "@/lib/storage/experimentSessions";
import { listRuns } from "@/lib/storage/runsStore";
import { hasCompletedSetup } from "@/lib/storage/uiPrefs";
import type { RunMode } from "@/lib/types";
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
  const [activeSessionId, setActiveSessionId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    setSetupCompleted(hasCompletedSetup());
    setPrefsLoaded(true);

    const availableSessions = listExperimentSessions();
    setSessions(availableSessions);

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

  const runCounts = useMemo(() => {
    const sessionId = activeSessionId || undefined;

    return {
      baseline: listRuns("baseline", sessionId).length,
      ab: listRuns("ab", sessionId).length,
      phase: listRuns("phase", sessionId).length,
      multiseat: listRuns("multiseat", sessionId).length,
      scout: listRuns("scout", sessionId).length,
      total: listRuns(undefined, sessionId).length
    };
  }, [activeSessionId, refreshTick]);

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
        </div>
        <p className="muted">
          Active session: <strong>{activeSession?.name ?? "Not selected"}</strong> ({runCountLabel(runCounts.total)}).
        </p>
        {sessionMessage ? <p className="muted">{sessionMessage}</p> : null}
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
