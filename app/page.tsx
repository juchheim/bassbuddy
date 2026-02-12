"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModeCard } from "@/components/ModeCard";
import { listRuns } from "@/lib/storage/runsStore";
import { hasCompletedSetup } from "@/lib/storage/uiPrefs";
import type { RunMode } from "@/lib/types";
import styles from "@/app/page.module.css";

interface RunCounts {
  baseline: number;
  ab: number;
  phase: number;
  total: number;
}

function startHref(mode: RunMode, setupCompleted: boolean): string {
  return setupCompleted ? `/record?mode=${mode}` : `/setup?mode=${mode}`;
}

function readCounts(): RunCounts {
  return {
    baseline: listRuns("baseline").length,
    ab: listRuns("ab").length,
    phase: listRuns("phase").length,
    total: listRuns().length
  };
}

export default function HomePage() {
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<RunCounts>({ baseline: 0, ab: 0, phase: 0, total: 0 });

  useEffect(() => {
    const refresh = () => {
      setSetupCompleted(hasCompletedSetup());
      setCounts(readCounts());
      setReady(true);
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const setupText = useMemo(() => {
    if (!ready) {
      return "Checking setup status...";
    }

    return setupCompleted
      ? "Quick Start ready on this device."
      : "First-time setup required once (checklist + mic check).";
  }, [ready, setupCompleted]);

  const runCountLabel = (count: number) => `${count} saved run${count === 1 ? "" : "s"}`;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Simple sub-placement decisions from your phone/laptop mic.</h1>
      </header>

      <section className={`panel ${styles.startPanel}`}>
        <h2 className={styles.sectionTitle}>Start Here</h2>
        <p className="muted" style={{ margin: 0 }}>
          {setupText}
        </p>
        <ol className={styles.steps}>
          <li>Put the mic at the listening seat.</li>
          <li>Play the test track on your main system.</li>
          <li>Record two options and let SubSpot pick a winner.</li>
        </ol>
        <div className={styles.quickLinks}>
          <Link href="/test-track" className="cta ctaHighlight" style={{ textAlign: "center" }}>
            Open Test Track
          </Link>
          <Link href="/advanced" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Advanced Tools
          </Link>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 12 }}>
        <ModeCard
          title="Quick Baseline Measurement"
          description="Capture one run and review bass smoothness at the seat."
          href={startHref("baseline", setupCompleted)}
          cta={setupCompleted ? "Start Baseline" : "Open Setup"}
          meta={runCountLabel(counts.baseline)}
          highlightAction
        />
        <ModeCard
          title="Compare Two Placements (A/B)"
          description="Measure placement A and B, then get a clear winner."
          href={startHref("ab", setupCompleted)}
          cta={setupCompleted ? "Start A/B" : "Open Setup"}
          meta={runCountLabel(counts.ab)}
        />
        <ModeCard
          title="Phase Test (0 vs 180)"
          description="Measure both phase settings and keep the better one."
          href={startHref("phase", setupCompleted)}
          cta={setupCompleted ? "Start Phase Test" : "Open Setup"}
          meta={runCountLabel(counts.phase)}
        />
        <ModeCard
          title="Review Recent Compare"
          description="Open simple compare for your latest A/B or phase runs."
          href="/compare?mode=ab"
          cta="Open Compare"
          meta={`${counts.total} total saved run${counts.total === 1 ? "" : "s"}`}
        />
      </section>

      <section className={`panel ${styles.disclaimer}`}>
        <h2 className={styles.sectionTitle}>Important Notes</h2>
        <ul className={styles.list}>
          <li>Relative measurement only, not calibrated SPL.</li>
          <li>Keep volume and mic position fixed between runs.</li>
          <li>Phone/laptop mic processing may still affect results.</li>
        </ul>
      </section>
    </main>
  );
}
