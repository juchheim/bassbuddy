"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResponseChart } from "@/components/ResponseChart";
import { RunPicker } from "@/components/RunPicker";
import { getActiveExperimentSessionId } from "@/lib/storage/experimentSessions";
import { listRuns } from "@/lib/storage/runsStore";
import type { BassRun, RunMode } from "@/lib/types";
import { compareRuns } from "@/lib/utils/compareRuns";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import styles from "@/app/compare/compare.module.css";

const SIMPLE_MODES: RunMode[] = ["baseline", "ab", "phase"];

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
  const winnerLabel = winner.label ?? (winner.id === runA.id ? "Run A" : "Run B");

  let detail = `${winnerLabel} wins: less boom at ~${winner.highlights.worstPeakHz} Hz`;

  if (winner.highlights.deepDipCount < loser.highlights.deepDipCount) {
    detail += " and fewer deep dips.";
  } else {
    detail += ".";
  }

  const suggestions: string[] = [];

  if (winner.highlights.maxPeakDb > 6) {
    suggestions.push("Try moving the sub farther from corners to reduce boundary loading peaks.");
  }

  if (winner.highlights.maxDipDb < -10) {
    suggestions.push("Try moving the sub 1-2 ft; deep dips are often cancellations.");
  }

  if (!suggestions.length) {
    suggestions.push("Winner already looks relatively smooth for this measurement method.");
  }

  return {
    headline: detail,
    detail: `${decision.reason} ${suggestions.join(" ")}`
  };
}

export default function ComparePage() {
  const router = useRouter();
  const [mode, setMode] = useState<RunMode>("ab");
  const [sessionId, setSessionId] = useState("");
  const [runs, setRuns] = useState<BassRun[]>([]);
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = normalizeMode(params.get("mode"));

    if (!SIMPLE_MODES.includes(nextMode)) {
      router.replace(`/advanced/compare?${params.toString()}`);
      return;
    }

    setMode(nextMode);

    const requestedSessionId = params.get("session") ?? "";
    setSessionId(requestedSessionId || getActiveExperimentSessionId());
  }, [router]);

  useEffect(() => {
    const nextRuns = listRuns(mode, sessionId || undefined);
    setRuns(nextRuns);
    setSelectedA((prev) => (nextRuns.some((run) => run.id === prev) ? prev : nextRuns[0]?.id ?? ""));
    setSelectedB((prev) => {
      if (nextRuns.some((run) => run.id === prev)) {
        return prev;
      }

      return nextRuns[1]?.id ?? nextRuns[0]?.id ?? "";
    });
  }, [mode, sessionId]);

  const runA = useMemo(() => runs.find((run) => run.id === selectedA), [runs, selectedA]);
  const runB = useMemo(() => runs.find((run) => run.id === selectedB), [runs, selectedB]);

  const decision = useMemo(() => {
    if (!runA || !runB || runA.id === runB.id) {
      return null;
    }

    return compareRuns(runA, runB);
  }, [runA, runB]);

  const recommendation = useMemo(() => {
    if (!runA || !runB || runA.id === runB.id) {
      return null;
    }

    return recommendationText(runA, runB);
  }, [runA, runB]);

  const compareHref = `/compare?mode=${mode}${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}`;
  const advancedCompareHref = `/advanced/compare?mode=${mode}${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}`;
  const recordHref = `/record?mode=${mode}`;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Compare Runs</h1>
        <p className="muted">Mode: {modeTitle(mode)}</p>
      </header>

      <section className={`panel ${styles.controls}`}>
        <p className="muted" style={{ margin: 0 }}>
          Pick two runs in the same mode. The app declares a winner using smoothness score, then deep dips, then boom peak.
        </p>
        <div className={styles.modeSwitches}>
          <Link href={`/compare?mode=ab${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Placement A/B
          </Link>
          <Link href={`/compare?mode=phase${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Phase 0 vs 180
          </Link>
          <Link href={`/compare?mode=baseline${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ""}`} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Baseline Consistency
          </Link>
        </div>

        {runs.length >= 2 ? (
          <>
            <RunPicker id="runA" label="Run A" runs={runs} selectedId={selectedA} onSelect={setSelectedA} />
            <RunPicker id="runB" label="Run B" runs={runs} selectedId={selectedB} onSelect={setSelectedB} />
          </>
        ) : (
          <p className="warning" style={{ margin: 0 }}>
            Need at least two saved runs in this mode before comparison.
          </p>
        )}
      </section>

      {runA && runB && runA.id !== runB.id ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <ResponseChart
            series={[
              {
                id: runA.id,
                name: runA.label ?? "Run A",
                color: "var(--series-a)",
                measurements: runA.measurements
              },
              {
                id: runB.id,
                name: runB.label ?? "Run B",
                color: "var(--series-b)",
                measurements: runB.measurements
              }
            ]}
          />
        </section>
      ) : null}

      {recommendation ? (
        <section className="panel" style={{ marginTop: 12 }}>
          <h2 style={{ marginTop: 0 }}>Recommendation</h2>
          <p className={styles.recommendation}>{recommendation.headline}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            {recommendation.detail}
          </p>
          {decision?.winnerId === "tie" ? (
            <p className="warning" style={{ marginBottom: 0 }}>
              Tie result: rerun both options once more for confidence.
            </p>
          ) : null}
        </section>
      ) : null}

      <section style={{ marginTop: 12 }}>
        <div className={styles.rowActions}>
          <Link href={recordHref} className="cta ctaHighlight" style={{ textAlign: "center" }}>
            Run Another Measurement
          </Link>
          <Link href="/" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Back Home
          </Link>
          <Link href={advancedCompareHref} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Advanced Compare Tools
          </Link>
        </div>
      </section>

      <p className="muted" style={{ marginTop: 10 }}>
        Comparing current session: {sessionId ? "enabled" : "all local runs"}. <Link href={compareHref}>Refresh</Link>
      </p>
    </main>
  );
}
