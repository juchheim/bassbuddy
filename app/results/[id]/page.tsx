"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResponseChart } from "@/components/ResponseChart";
import { SummaryCard } from "@/components/SummaryCard";
import { deleteRun, getRunById, listRuns, updateRun } from "@/lib/storage/runsStore";
import type { BassRun } from "@/lib/types";
import { modeTitle } from "@/lib/utils/mode";
import styles from "@/app/results/[id]/results.module.css";

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const runId = params?.id;

  const [run, setRun] = useState<BassRun | null>(null);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const found = getRunById(runId) ?? null;
    setRun(found);
  }, [runId]);

  const runCountInMode = useMemo(() => {
    if (!run) {
      return 0;
    }

    return listRuns(run.mode).length;
  }, [run]);

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
              color: "#1d5f7a",
              measurements: run.measurements
            }
          ]}
        />
      </section>

      <section style={{ marginTop: 12 }}>
        <SummaryCard run={run} />
      </section>

      {run.notes ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2>Notes</h2>
          <p className="muted">{run.notes}</p>
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

        <Link href={`/setup?mode=${run.mode}`} className="cta" style={{ textAlign: "center" }}>
          Run Another Measurement
        </Link>

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
