"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDecisionReport, reportPrintText, type ConfidenceTier } from "@/lib/utils/decisionAssistant";
import { exportRunsPayload, listRuns } from "@/lib/storage/runsStore";
import styles from "@/app/decision/decision.module.css";

function confidenceClass(tier: ConfidenceTier): string {
  if (tier === "high") {
    return `${styles.confidenceBadge} ${styles.confidenceHigh}`;
  }

  if (tier === "medium") {
    return `${styles.confidenceBadge} ${styles.confidenceMedium}`;
  }

  return `${styles.confidenceBadge} ${styles.confidenceLow}`;
}

function filenameBase(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `bassbuddy-decision-${yyyy}${mm}${dd}`;
}

function downloadJson(name: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function printSummary(title: string, text: string): void {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=720");

  if (!popup) {
    window.print();
    return;
  }

  popup.document.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1f1f2b; }
      h1 { margin: 0 0 14px; font-size: 1.3rem; }
      pre { white-space: pre-wrap; line-height: 1.45; font-size: 0.95rem; margin: 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <pre>${escapeHtml(text)}</pre>
  </body>
</html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export default function DecisionPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const runs = useMemo(() => listRuns(), [refreshTick]);
  const report = useMemo(() => buildDecisionReport(runs), [runs]);

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Final Decision Assistant</h1>
        <p className="muted">
          Combines A/B, multi-seat, phase, and scout evidence into one recommendation with confidence gating.
        </p>
      </header>

      <section className={`panel ${styles.summaryPanel}`}>
        <div className={styles.sectionTitleRow}>
          <h2 style={{ margin: 0 }}>Summary</h2>
          <span className={confidenceClass(report.overallConfidence)}>
            {report.overallConfidence.toUpperCase()} ({report.overallScore}/100)
          </span>
        </div>
        <p className={styles.meta}>{report.summary}</p>
        <p className={styles.meta}>
          Generated from {runs.length} saved run{runs.length === 1 ? "" : "s"}.
        </p>
        {report.scout.candidateCount > 0 ? (
          <p className={styles.meta}>
            Scout candidates: {report.scout.candidateCount}
            {report.scout.topTwo.length
              ? ` (top two: ${report.scout.topTwo[0]} and ${report.scout.topTwo[1]})`
              : ""}
          </p>
        ) : null}
      </section>

      <section className={`panel ${styles.actions}`} style={{ marginTop: 12 }}>
        <button
          type="button"
          className="cta ctaSecondary"
          onClick={() => {
            setRefreshTick((value) => value + 1);
            setMessage("Refreshed report from local saved runs.");
          }}
        >
          Refresh From Saved Runs
        </button>
        <button
          type="button"
          className="cta ctaSecondary"
          onClick={() => {
            const payload = {
              type: "bassbuddy.decision-report.v1",
              report,
              runsExport: exportRunsPayload()
            };

            downloadJson(`${filenameBase()}.json`, payload);
            setMessage("Exported decision report JSON.");
          }}
        >
          Export Report JSON
        </button>
        <button
          type="button"
          className="cta ctaSecondary"
          onClick={() => {
            printSummary("BassBuddy Final Decision Report", reportPrintText(report));
            setMessage("Opened printable summary.");
          }}
        >
          Print Summary
        </button>
        <Link href="/compare" className="cta ctaSecondary" style={{ textAlign: "center" }}>
          Open Compare
        </Link>
      </section>

      <section className={`panel ${styles.sectionPanel}`} style={{ marginTop: 12 }}>
        <div className={styles.sectionTitleRow}>
          <h2 style={{ margin: 0 }}>Placement Decision</h2>
          <span className={confidenceClass(report.placement.confidence)}>
            {report.placement.confidence.toUpperCase()} ({report.placement.confidenceScore}/100)
          </span>
        </div>
        <p className={styles.meta}>
          Winner: <strong>{report.placement.winner ?? "No winner yet"}</strong>
        </p>
        <p className={styles.meta}>{report.placement.rationale}</p>
        {report.placement.blockers.map((entry) => (
          <p className="error" style={{ margin: 0 }} key={`placement-blocker-${entry}`}>
            {entry}
          </p>
        ))}
        {report.placement.warnings.map((entry) => (
          <p className="warning" style={{ margin: 0 }} key={`placement-warning-${entry}`}>
            {entry}
          </p>
        ))}
        <div className={styles.evidenceList}>
          {report.placement.evidence.map((entry) => (
            <article className={styles.evidenceCard} key={`placement-evidence-${entry.source}`}>
              <p className={styles.evidenceTitle}>{entry.source}</p>
              <p className={styles.meta}>
                Winner: {entry.winner ?? "Not declared"} | {entry.canDeclare ? "Gate passed" : "Gate blocked"}
              </p>
              <p className={styles.meta}>{entry.rationale}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.sectionPanel}`} style={{ marginTop: 12 }}>
        <div className={styles.sectionTitleRow}>
          <h2 style={{ margin: 0 }}>Phase Decision</h2>
          <span className={confidenceClass(report.phase.confidence)}>
            {report.phase.confidence.toUpperCase()} ({report.phase.confidenceScore}/100)
          </span>
        </div>
        <p className={styles.meta}>
          Winner: <strong>{report.phase.winner ?? "No winner yet"}</strong>
        </p>
        <p className={styles.meta}>{report.phase.rationale}</p>
        {report.phase.blockers.map((entry) => (
          <p className="error" style={{ margin: 0 }} key={`phase-blocker-${entry}`}>
            {entry}
          </p>
        ))}
        {report.phase.warnings.map((entry) => (
          <p className="warning" style={{ margin: 0 }} key={`phase-warning-${entry}`}>
            {entry}
          </p>
        ))}
        <div className={styles.evidenceList}>
          {report.phase.evidence.map((entry) => (
            <article className={styles.evidenceCard} key={`phase-evidence-${entry.source}`}>
              <p className={styles.evidenceTitle}>{entry.source}</p>
              <p className={styles.meta}>
                Winner: {entry.winner ?? "Not declared"} | {entry.canDeclare ? "Gate passed" : "Gate blocked"}
              </p>
              <p className={styles.meta}>{entry.rationale}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`panel ${styles.sectionPanel}`} style={{ marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>Action Plan</h2>
        {report.nextActions.length ? (
          <ul className={styles.compactList}>
            {report.nextActions.map((entry) => (
              <li key={`action-${entry}`}>{entry}</li>
            ))}
          </ul>
        ) : (
          <p className={styles.meta}>No additional actions required.</p>
        )}
      </section>

      <section style={{ marginTop: 12 }}>
        <Link href="/" className="cta ctaSecondary" style={{ textAlign: "center" }}>
          Back Home
        </Link>
      </section>

      {message ? (
        <p className="muted" style={{ marginTop: 10 }}>
          {message}
        </p>
      ) : null}
    </main>
  );
}

