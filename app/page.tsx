"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModeCard } from "@/components/ModeCard";
import { listPlacementSessions } from "@/lib/placementMap/store";
import { listRuns } from "@/lib/storage/runsStore";
import { hasCompletedSetup } from "@/lib/storage/uiPrefs";
import type { RunMode } from "@/lib/types";
import styles from "@/app/page.module.css";

interface RunCounts {
  baseline: number;
  ab: number;
  phase: number;
  placementSessions: number;
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
    placementSessions: listPlacementSessions().length,
    total: listRuns().length
  };
}

export default function HomePage() {
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<RunCounts>({ baseline: 0, ab: 0, phase: 0, placementSessions: 0, total: 0 });

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
        <h1 className={styles.pageTitle}>Choose Your Primary Tool</h1>
      </header>

      <section className={`panel ${styles.startPanel}`}>
        <h2 className={styles.sectionTitle}>Tool Picker</h2>
        <p className="muted" style={{ margin: 0 }}>
          {setupText} Pick the fastest flow for what you are trying to do right now.
        </p>
        <div className={styles.primaryTools}>
          <article className={styles.toolCard}>
            <p className={styles.toolMeta}>Quick</p>
            <h3 className={styles.toolTitle}>Run Audio Test</h3>
            <p className={styles.toolDescription}>Measure a single position fast. Great for quick checks.</p>
            <p className={styles.toolCount}>{runCountLabel(counts.baseline)}</p>
            <Link
              href={startHref("baseline", setupCompleted)}
              className="cta ctaHighlight"
              style={{ textAlign: "center" }}
            >
              {setupCompleted ? "Start Test" : "Open Setup"}
            </Link>
          </article>
          <article className={styles.toolCard}>
            <div className={styles.toolHeaderRow}>
              <p className={styles.toolMeta}>Session</p>
              <span className={styles.newBadge}>NEW</span>
            </div>
            <h3 className={styles.toolTitle}>Placement Map + Heatmap</h3>
            <p className={styles.toolDescription}>Test multiple placements and visualize best spots.</p>
            <p className={styles.toolCount}>
              {counts.placementSessions} placement session{counts.placementSessions === 1 ? "" : "s"}
            </p>
            <Link href="/placement-map" className="cta ctaHighlight" style={{ textAlign: "center" }}>
              Start Session
            </Link>
          </article>
        </div>
        <div className={styles.quickLinksSection}>
          <p className={styles.quickLinksLabel}>Support Tools</p>
          <div className={styles.quickLinks}>
            <Link href="/test-track" className={`cta ${styles.trackButton}`} style={{ textAlign: "center" }}>
              Open Test Track
            </Link>
            <Link href="/advanced" className="cta ctaSecondary" style={{ textAlign: "center" }}>
              Advanced Tools
            </Link>
          </div>
        </div>
      </section>

      <section className={`panel ${styles.secondaryPanel}`}>
        <h2 className={styles.sectionTitle}>More Compare Tools</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Use these after quick captures when you want focused A/B or phase decisions.
        </p>
      </section>
      <section className="grid two" style={{ marginTop: 12 }}>
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
