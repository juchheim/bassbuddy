import Link from "next/link";
import styles from "@/app/test-track/test-track.module.css";

export default function TestTrackPage() {
  return (
    <main className="pageContainer">
      <h1>Test Track</h1>

      <section className="panel">
        <p className={styles.info}>
          Play this track on your main system while SubSpot records from your seat mic device. Keep playback volume
          fixed for all comparisons.
        </p>

        <audio controls style={{ width: "100%", marginTop: 12 }} src="/test-tracks/bassbuddy_mvp.wav">
          Your browser does not support the audio element.
        </audio>

        <div className={styles.actions} style={{ marginTop: 12 }}>
          <a className="cta ctaSecondary" href="/test-tracks/bassbuddy_mvp.wav" download style={{ textAlign: "center" }}>
            Download WAV
          </a>
          <Link href="/" className="cta" style={{ textAlign: "center" }}>
            Back Home
          </Link>
        </div>
      </section>
    </main>
  );
}
