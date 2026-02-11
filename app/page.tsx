"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModeCard } from "@/components/ModeCard";
import { ResetRunsButton } from "@/components/ResetRunsButton";
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

  useEffect(() => {
    setSetupCompleted(hasCompletedSetup());
    setPrefsLoaded(true);
  }, []);

  const statusText = useMemo(() => {
    if (!prefsLoaded) {
      return "Checking setup status...";
    }

    return setupCompleted
      ? "Quick Start enabled: checklist + mic check already completed on this device."
      : "First-time setup required: complete checklist + mic check once to unlock Quick Start.";
  }, [prefsLoaded, setupCompleted]);

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

      <section className="grid two" style={{ marginTop: 12 }}>
        <ModeCard
          title="Quick Baseline Measurement"
          description="Capture one run at your seat and see the response curve + smoothness score."
          href={startHref("baseline", setupCompleted)}
          cta={setupCompleted ? "Start Baseline" : "Open Setup"}
        />
        <ModeCard
          title="Compare Two Placements (A/B)"
          description="Measure placement A and B, then get a clear winner based on smoothness and dips."
          href={startHref("ab", setupCompleted)}
          cta={setupCompleted ? "Start A/B" : "Open Setup"}
        />
        <ModeCard
          title="Phase Test (0 vs 180)"
          description="Measure with phase switch at 0° and 180° and choose the better setting."
          href={startHref("phase", setupCompleted)}
          cta={setupCompleted ? "Start Phase Test" : "Open Setup"}
        />
        <ModeCard
          title="Multi-Seat Compromise (A/B)"
          description="Measure center/left/right seats for A and B, then pick the better compromise."
          href={startHref("multiseat", setupCompleted)}
          cta={setupCompleted ? "Start Multi-Seat" : "Open Setup"}
        />
        <ModeCard
          title="Review Saved Runs"
          description="Open compare view to overlay existing runs and re-check decisions."
          href="/compare"
          cta="Open Compare"
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
        <h2 className={styles.sectionTitle}>Start Fresh</h2>
        <p className="muted">Delete saved runs if you want to restart measurements from scratch.</p>
        <ResetRunsButton className="cta ctaDanger" />
      </section>
    </main>
  );
}
