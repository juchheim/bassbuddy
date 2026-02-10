import Link from "next/link";
import { ModeCard } from "@/components/ModeCard";
import styles from "@/app/page.module.css";

export default function HomePage() {
  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>BassBuddy (MVP)</h1>
        <p className={styles.subtitle}>
          Sub Placement Coach for quick relative bass measurements using your phone/laptop mic.
        </p>
      </header>

      <section className="grid two">
        <ModeCard
          title="Quick Baseline Measurement"
          description="Capture one run at your seat and see the response curve + smoothness score."
          href="/setup?mode=baseline"
          cta="Start Baseline"
        />
        <ModeCard
          title="Compare Two Placements (A/B)"
          description="Measure placement A and B, then get a clear winner based on smoothness and dips."
          href="/setup?mode=ab"
          cta="Start A/B"
        />
        <ModeCard
          title="Phase Test (0 vs 180)"
          description="Measure with phase switch at 0° and 180° and choose the better setting."
          href="/setup?mode=phase"
          cta="Start Phase Test"
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
          Play the BassBuddy test track on your main system while this app listens at the seat mic. BassBuddy aligns
          to the sync beep, measures each bass tone step, then shows relative dB smoothness.
        </p>
        <ul className={styles.list}>
          <li>Relative measurement only: not calibrated SPL.</li>
          <li>Keep playback volume and mic position identical between runs.</li>
          <li>Consumer mic processing can affect results even when we request it off.</li>
        </ul>
      </section>

      <section style={{ marginTop: 12 }}>
        <Link href="/test-track" className="cta ctaSecondary" style={{ display: "inline-block", textAlign: "center" }}>
          Open Test Track Page
        </Link>
      </section>
    </main>
  );
}
