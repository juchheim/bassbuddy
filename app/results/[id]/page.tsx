"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResponseChart } from "@/components/ResponseChart";
import { SummaryCard } from "@/components/SummaryCard";
import { MULTI_SEAT_LABELS } from "@/lib/constants/multiSeat";
import {
  describeGuidedStep,
  getCurrentGuidedStep,
  getGuidedProgress,
  getGuidedSessionForMode,
  isGuidedSessionComplete,
  type GuidedSessionV1
} from "@/lib/storage/guidedSession";
import { deleteRun, getRunById, listRuns, updateRun } from "@/lib/storage/runsStore";
import type { BassRun } from "@/lib/types";
import { modeTitle } from "@/lib/utils/mode";
import styles from "@/app/results/[id]/results.module.css";

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const runId = params?.id;

  const [run, setRun] = useState<BassRun | null>(null);
  const [guidedSession, setGuidedSession] = useState<GuidedSessionV1 | null>(null);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const found = getRunById(runId) ?? null;
    setRun(found);
    setGuidedSession(found ? getGuidedSessionForMode(found.mode) : null);
  }, [runId]);

  const runCountInMode = useMemo(() => {
    if (!run) {
      return 0;
    }

    return listRuns(run.mode).length;
  }, [run]);
  const guidedProgress = guidedSession ? getGuidedProgress(guidedSession) : null;
  const guidedComplete = guidedSession ? isGuidedSessionComplete(guidedSession) : false;
  const nextGuidedStep = guidedSession ? getCurrentGuidedStep(guidedSession) : null;

  if (!run) {
    return (
      <main className="pageContainer">
        <h1>Results</h1>
        <p className="muted">Run not found. It may have been removed from local storage.</p>
        <Link href="/" className="cta ctaSecondary" style={{ textAlign: "center" }}>
          Back Home
        </Link>
      </main>
    );
  }

  const modeActions =
    run.mode === "ab"
      ? ["Placement A", "Placement B"]
      : run.mode === "phase"
      ? ["Phase 0", "Phase 180"]
      : run.mode === "multiseat"
      ? MULTI_SEAT_LABELS.map((entry) => entry.label)
      : [];

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Measurement Captured</h1>
        <p className="muted">Mode: {modeTitle(run.mode)}</p>
      </header>

      <section className="panel">
        <ResponseChart
          series={[
            {
              id: run.id,
              name: run.label ?? "Current Run",
              color: "var(--series-a)",
              measurements: run.measurements
            }
          ]}
        />
      </section>

      <section style={{ marginTop: 12 }}>
        <SummaryCard run={run} />
      </section>

      {run.quality ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Run Quality</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Quality score: <strong>{run.quality.score}/100</strong> ({run.quality.tier})
          </p>
          {run.quality.blocking ? (
            <p className="error" style={{ margin: 0 }}>
              This run should be retaken before using it for placement decisions.
            </p>
          ) : null}
          {run.quality.issues.map((issue) => (
            <p className="warning" key={issue} style={{ margin: 0 }}>
              {issue}
            </p>
          ))}
        </section>
      ) : null}

      {run.notes ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Notes</h2>
          <p className="muted">{run.notes}</p>
        </section>
      ) : null}

      {guidedSession ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Guided Session</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Progress: {guidedProgress?.completed ?? 0}/{guidedProgress?.total ?? 0}
          </p>
          {!guidedComplete && nextGuidedStep ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              Next step: {describeGuidedStep(nextGuidedStep)}
            </p>
          ) : (
            <p className="ok" style={{ marginBottom: 0 }}>
              Session complete. Open Compare to evaluate median profiles.
            </p>
          )}
        </section>
      ) : null}

      <section className={styles.actions} style={{ marginTop: 12 }}>
        {modeActions.map((label) => (
          <button
            className="cta ctaSecondary"
            type="button"
            key={label}
            onClick={() => {
              const next = updateRun(run.id, (existing) => ({ ...existing, label }));
              if (next) {
                setRun(next);
              }
            }}
          >
            Save as {label}
          </button>
        ))}

        {guidedSession && !guidedComplete ? (
          <Link href={`/record?mode=${run.mode}`} className="cta" style={{ textAlign: "center" }}>
            Continue Guided Session
          </Link>
        ) : (
          <Link href={`/setup?mode=${run.mode}`} className="cta" style={{ textAlign: "center" }}>
            Run Another Measurement
          </Link>
        )}

        {runCountInMode >= 2 ? (
          <Link href={`/compare?mode=${run.mode}`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Go to Compare
          </Link>
        ) : null}

        <button
          type="button"
          className="cta ctaDanger"
          onClick={() => {
            if (!window.confirm("Delete this run?")) {
              return;
            }

            const removed = deleteRun(run.id);
            if (removed) {
              router.push(`/compare?mode=${run.mode}`);
            }
          }}
        >
          Delete This Run
        </button>

        <Link href="/" className="cta ctaSecondary" style={{ textAlign: "center" }}>
          Home
        </Link>
      </section>
    </main>
  );
}
