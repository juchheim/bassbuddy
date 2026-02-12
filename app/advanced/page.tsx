"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SessionTools } from "@/components/SessionTools";
import { getActiveExperimentSessionId } from "@/lib/storage/experimentSessions";
import { listRuns } from "@/lib/storage/runsStore";
import styles from "@/app/advanced/advanced.module.css";

export default function AdvancedToolsPage() {
  const activeSessionId = useMemo(() => getActiveExperimentSessionId(), []);
  const runCount = useMemo(() => listRuns(undefined, activeSessionId || undefined).length, [activeSessionId]);

  const abSetup = `/setup?mode=ab&advanced=1`;
  const phaseSetup = `/setup?mode=phase&advanced=1`;
  const multiseatSetup = `/setup?mode=multiseat&advanced=1`;
  const scoutSetup = `/setup?mode=scout&advanced=1`;
  const advancedCompare = `/advanced/compare?mode=ab${activeSessionId ? `&session=${encodeURIComponent(activeSessionId)}` : ""}`;

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Advanced Tools</h1>
        <p className="muted">
          Extra workflows and power-user controls. For fastest day-to-day use, go back to Home and use Baseline, A/B,
          or Phase.
        </p>
      </header>

      <section className={`panel ${styles.section}`}>
        <h2 style={{ margin: 0 }}>Advanced Measurement Modes</h2>
        <div className={styles.grid}>
          <Link href={abSetup} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Guided A/B Setup
          </Link>
          <Link href={phaseSetup} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Guided Phase Setup
          </Link>
          <Link href={multiseatSetup} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Multi-Seat Compromise
          </Link>
          <Link href={scoutSetup} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Placement Scout (4-8)
          </Link>
        </div>
      </section>

      <section className={`panel ${styles.section}`} style={{ marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>Advanced Analysis</h2>
        <p className="muted" style={{ margin: 0 }}>
          Active session run count: {runCount}
        </p>
        <div className={styles.grid}>
          <Link href={advancedCompare} className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Advanced Compare
          </Link>
          <Link href="/placement-map" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Placement Map
          </Link>
          <Link href="/decision" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Final Decision Assistant
          </Link>
          <Link href="/test-track" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Test Track
          </Link>
        </div>
      </section>

      <section className={`panel ${styles.section}`} style={{ marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>Data and Backup</h2>
        <p className="muted" style={{ margin: 0 }}>
          Fresh reset, export full bundle, or import/restore bundle.
        </p>
        <SessionTools />
      </section>

      <section style={{ marginTop: 12 }}>
        <Link href="/" className="cta" style={{ textAlign: "center" }}>
          Back To Simple Home
        </Link>
      </section>
    </main>
  );
}
