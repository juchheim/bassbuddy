import type { BassRun } from "@/lib/types";
import { findProblemBands, verdictForScore } from "@/lib/utils/runSummary";
import styles from "@/components/SummaryCard.module.css";

interface SummaryCardProps {
  run: BassRun;
}

export function SummaryCard({ run }: SummaryCardProps) {
  const verdict = verdictForScore(run.score);
  const problemBands = findProblemBands(run.measurements);

  return (
    <div className={`${styles.wrap} panel`}>
      <p className={styles.line}>
        Smoothness Score: <strong>{run.score.toFixed(1)}</strong>
      </p>
      <p className={styles.line}>
        Overall Verdict: <span className={styles.badge}>{verdict}</span>
      </p>
      <p className={styles.line}>
        Worst peak region: {run.highlights.worstPeakHz} Hz ({run.highlights.maxPeakDb.toFixed(1)} dB)
      </p>
      <p className={styles.line}>
        Worst dip region: {run.highlights.worstDipHz} Hz ({run.highlights.maxDipDb.toFixed(1)} dB)
      </p>
      <p className={styles.line}>Deep dips (&lt; -10 dB): {run.highlights.deepDipCount}</p>
      <p className={styles.line}>Big peaks (&gt; +6 dB): {run.highlights.bigPeakCount}</p>
      {typeof run.volumeDriftDb === "number" ? (
        <p className={styles.line}>Session volume drift: {run.volumeDriftDb.toFixed(1)} dB</p>
      ) : null}
      {problemBands.length ? (
        <ul className={styles.problemList}>
          {problemBands.map((band) => (
            <li key={`${band.type}-${band.startHz}-${band.endHz}`}>
              {band.type === "peak" ? "Peak" : "Dip"} band {band.startHz}-{band.endHz} Hz (worst at {band.worstHz}
              Hz)
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.line}>No major problem bands above thresholds.</p>
      )}
    </div>
  );
}
