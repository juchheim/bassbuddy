"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResetRunsButton } from "@/components/ResetRunsButton";
import { ResponseChart } from "@/components/ResponseChart";
import { RunPicker } from "@/components/RunPicker";
import { deleteRun, listRuns } from "@/lib/storage/runsStore";
import type { BassRun, RunMode } from "@/lib/types";
import { compareRuns } from "@/lib/utils/compareRuns";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import styles from "@/app/compare/compare.module.css";

function recommendationText(runA: BassRun, runB: BassRun) {
  const decision = compareRuns(runA, runB);

  if (decision.winnerId === "tie") {
    return {
      headline: "Tie: both runs are effectively equivalent.",
      detail: decision.reason
    };
  }

  const winner = decision.winnerId === runA.id ? runA : runB;
  const loser = decision.winnerId === runA.id ? runB : runA;
  const winnerLabel = winner.label ?? (winner.id === runA.id ? "A" : "B");

  let detail = `${winnerLabel} wins: less boom at ~${winner.highlights.worstPeakHz} Hz`;

  if (winner.highlights.deepDipCount < loser.highlights.deepDipCount) {
    detail += " and fewer deep dips.";
  } else {
    detail += ".";
  }

  const nextSuggestions: string[] = [];

  if (winner.highlights.maxPeakDb > 6) {
    nextSuggestions.push("Try moving the sub farther from corners to reduce boundary loading peaks.");
  }

  if (winner.highlights.maxDipDb < -10) {
    nextSuggestions.push("Try moving the sub 1-2 ft; deep dips are often cancellations.");
  }

  if (!nextSuggestions.length) {
    nextSuggestions.push("Current winner already looks relatively smooth for this MVP method.");
  }

  return {
    headline: detail,
    detail: `${decision.reason} ${nextSuggestions.join(" ")}`
  };
}

export default function ComparePage() {
  const [mode, setMode] = useState<RunMode>("ab");
  const [runs, setRuns] = useState<BassRun[]>([]);
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(normalizeMode(params.get("mode")));
  }, []);

  useEffect(() => {
    const nextRuns = listRuns(mode);
    setRuns(nextRuns);

    const first = nextRuns[0]?.id ?? "";
    const second = nextRuns[1]?.id ?? first;
    setSelectedA(first);
    setSelectedB(second);
  }, [mode]);

  const runA = useMemo(() => runs.find((run) => run.id === selectedA), [runs, selectedA]);
  const runB = useMemo(() => runs.find((run) => run.id === selectedB), [runs, selectedB]);

  const recommendation =
    runA && runB && runA.id !== runB.id ? recommendationText(runA, runB) : null;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Compare Runs</h1>
        <p className="muted">Overlay two measurements and choose the smoother result.</p>
      </header>

      <section className={`panel ${styles.controls}`}>
        <label>
          Compare mode
          <select value={mode} onChange={(event) => setMode(normalizeMode(event.target.value))}>
            <option value="ab">Compare Two Placements (A/B)</option>
            <option value="phase">Phase Test (0 vs 180)</option>
            <option value="baseline">Quick Baseline</option>
          </select>
        </label>
        <p className="muted">Current mode: {modeTitle(mode)}</p>

        {runs.length >= 2 ? (
          <>
            <RunPicker id="runA" label="Run A" runs={runs} selectedId={selectedA} onSelect={setSelectedA} />
            <RunPicker id="runB" label="Run B" runs={runs} selectedId={selectedB} onSelect={setSelectedB} />
            <div className={styles.rowActions}>
              <button
                type="button"
                className="cta ctaSecondary"
                disabled={!selectedA}
                onClick={() => {
                  const run = runs.find((entry) => entry.id === selectedA);
                  if (!run) {
                    setNotice("Run A was not found.");
                    return;
                  }

                  if (!window.confirm(`Delete "${run.label ?? "Run A"}"?`)) {
                    return;
                  }

                  const removed = deleteRun(run.id);
                  if (removed) {
                    setNotice("Deleted selected Run A.");
                    const nextRuns = listRuns(mode);
                    setRuns(nextRuns);
                    setSelectedA(nextRuns[0]?.id ?? "");
                    setSelectedB(nextRuns[1]?.id ?? nextRuns[0]?.id ?? "");
                  } else {
                    setNotice("Could not delete selected Run A.");
                  }
                }}
              >
                Delete Selected Run A
              </button>
              <button
                type="button"
                className="cta ctaSecondary"
                disabled={!selectedB}
                onClick={() => {
                  const run = runs.find((entry) => entry.id === selectedB);
                  if (!run) {
                    setNotice("Run B was not found.");
                    return;
                  }

                  if (!window.confirm(`Delete "${run.label ?? "Run B"}"?`)) {
                    return;
                  }

                  const removed = deleteRun(run.id);
                  if (removed) {
                    setNotice("Deleted selected Run B.");
                    const nextRuns = listRuns(mode);
                    setRuns(nextRuns);
                    setSelectedA(nextRuns[0]?.id ?? "");
                    setSelectedB(nextRuns[1]?.id ?? nextRuns[0]?.id ?? "");
                  } else {
                    setNotice("Could not delete selected Run B.");
                  }
                }}
              >
                Delete Selected Run B
              </button>
            </div>
          </>
        ) : (
          <p className="warning">Need at least two saved runs in this mode to compare.</p>
        )}
        <ResetRunsButton
          mode={mode}
          className="cta ctaDanger"
          label="Start Fresh (Delete Runs In This Mode)"
          onCleared={() => {
            const nextRuns = listRuns(mode);
            setRuns(nextRuns);
            setSelectedA(nextRuns[0]?.id ?? "");
            setSelectedB(nextRuns[1]?.id ?? nextRuns[0]?.id ?? "");
            setNotice("Deleted runs in this mode.");
          }}
        />
        {notice ? <p className="muted" style={{ margin: 0 }}>{notice}</p> : null}
      </section>

      {runA && runB && runA.id !== runB.id ? (
        <>
          <section className="panel" style={{ marginTop: 12 }}>
            <ResponseChart
              series={[
                {
                  id: runA.id,
                  name: runA.label ?? "Run A",
                  color: "#1d5f7a",
                  measurements: runA.measurements
                },
                {
                  id: runB.id,
                  name: runB.label ?? "Run B",
                  color: "#b65f0f",
                  measurements: runB.measurements
                }
              ]}
            />
          </section>

          {recommendation ? (
            <section className="panel" style={{ marginTop: 12 }}>
              <h2>Recommendation</h2>
              <p className={styles.recommendation}>{recommendation.headline}</p>
              <p className="muted">{recommendation.detail}</p>
            </section>
          ) : null}
        </>
      ) : null}

      <section style={{ marginTop: 12 }}>
        <Link href={`/setup?mode=${mode}`} className="cta" style={{ textAlign: "center" }}>
          Run Another Measurement
        </Link>
      </section>
    </main>
  );
}
