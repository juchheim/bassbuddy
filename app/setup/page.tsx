"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Checklist, type ChecklistItem } from "@/components/Checklist";
import { MicMeter, type MicLevelStatus } from "@/components/MicMeter";
import type { MicSettingsSnapshot, RunMode } from "@/lib/types";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import styles from "@/app/setup/setup.module.css";

const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: "seat",
    label: "Place phone/laptop at the listening position with mic unobstructed."
  },
  {
    id: "volume",
    label: "Keep playback volume constant between all runs."
  },
  {
    id: "processing",
    label: "Turn off voice isolation/noise filtering modes if available."
  }
];

export default function SetupPage() {
  const [mode, setMode] = useState<RunMode>("baseline");

  const [checks, setChecks] = useState<Record<string, boolean>>({
    seat: false,
    volume: false,
    processing: false
  });

  const [micSnapshot, setMicSnapshot] = useState<MicSettingsSnapshot | null>(null);
  const [levelStatus, setLevelStatus] = useState<MicLevelStatus>("unknown");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode(normalizeMode(params.get("mode")));
  }, []);

  const allChecked = useMemo(() => CHECKLIST_ITEMS.every((item) => Boolean(checks[item.id])), [checks]);
  const canContinue = allChecked && micSnapshot !== null && levelStatus !== "unknown";

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Setup</h1>
        <p className="muted">Mode: {modeTitle(mode)}</p>
      </header>

      <section className={`panel ${styles.row}`}>
        <h2>Checklist</h2>
        <Checklist
          items={CHECKLIST_ITEMS}
          values={checks}
          onToggle={(id, checked) => setChecks((prev) => ({ ...prev, [id]: checked }))}
        />
      </section>

      <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
        <h2>Mic Level Check</h2>
        <p className={styles.note}>
          We request echo cancellation, noise suppression, and auto-gain control off. Browser/device behavior varies.
        </p>
        <MicMeter onSnapshot={setMicSnapshot} onLevelStatus={setLevelStatus} />
      </section>

      <section className={`panel ${styles.row}`} style={{ marginTop: 12 }}>
        <h2>Test Track</h2>
        <p className={styles.note}>
          Recommended workflow: play this track on your main system while BassBuddy records here.
        </p>
        <div className={styles.links}>
          <Link href="/test-track" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Test Track
          </Link>
          <a href="/test-tracks/bassbuddy_mvp.wav" className="cta ctaSecondary" download style={{ textAlign: "center" }}>
            Download WAV Test Track
          </a>
        </div>
      </section>

      <section style={{ marginTop: 12 }}>
        <Link
          href={`/record?mode=${mode}`}
          aria-disabled={!canContinue}
          className="cta"
          style={{
            pointerEvents: canContinue ? "auto" : "none",
            opacity: canContinue ? 1 : 0.5,
            display: "inline-block",
            textAlign: "center"
          }}
        >
          Continue to Record
        </Link>
      </section>

      {!canContinue ? (
        <p className="warning" style={{ marginTop: 8 }}>
          Complete checklist and run mic check before continuing.
        </p>
      ) : null}
    </main>
  );
}
