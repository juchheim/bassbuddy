"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  clearDecisionSnapshots,
  deleteDecisionSnapshot,
  listDecisionSnapshots,
  saveDecisionSnapshot
} from "@/lib/storage/decisionSnapshots";
import {
  createExperimentSession,
  getActiveExperimentSessionId,
  listExperimentSessions,
  renameExperimentSession,
  setActiveExperimentSession
} from "@/lib/storage/experimentSessions";
import { exportRunsPayload, listRuns } from "@/lib/storage/runsStore";
import {
  buildDecisionReport,
  compareDecisionReports,
  reportPrintText,
  type ConfidenceTier
} from "@/lib/utils/decisionAssistant";
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

function formatDelta(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

export default function DecisionPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [renameSessionName, setRenameSessionName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");

  const sessions = useMemo(() => listExperimentSessions(), [refreshTick]);

  useEffect(() => {
    const currentActive = getActiveExperimentSessionId();
    setActiveSessionId(currentActive);
  }, [refreshTick]);

  useEffect(() => {
    if (!sessions.length) {
      return;
    }

    if (!activeSessionId || !sessions.some((session) => session.id === activeSessionId)) {
      const fallback = sessions[0]?.id;

      if (fallback) {
        setActiveExperimentSession(fallback);
        setActiveSessionId(fallback);
      }
    }
  }, [activeSessionId, sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  const runs = useMemo(() => listRuns(undefined, activeSessionId || undefined), [activeSessionId, refreshTick]);
  const report = useMemo(() => buildDecisionReport(runs), [runs]);
  const snapshots = useMemo(
    () => listDecisionSnapshots(activeSessionId || undefined),
    [activeSessionId, refreshTick]
  );

  useEffect(() => {
    if (!snapshots.length) {
      setSelectedSnapshotId("");
      return;
    }

    if (!selectedSnapshotId || !snapshots.some((entry) => entry.id === selectedSnapshotId)) {
      setSelectedSnapshotId(snapshots[0].id);
    }
  }, [selectedSnapshotId, snapshots]);

  useEffect(() => {
    setRenameSessionName(activeSession?.name ?? "");
  }, [activeSession?.id, activeSession?.name]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((entry) => entry.id === selectedSnapshotId) ?? null,
    [selectedSnapshotId, snapshots]
  );

  const snapshotDelta = useMemo(() => {
    if (!selectedSnapshot) {
      return null;
    }

    return compareDecisionReports(selectedSnapshot.report, report);
  }, [report, selectedSnapshot]);

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

        <label>
          Active experiment session
          <select
            value={activeSessionId}
            onChange={(event) => {
              const next = event.target.value;
              const switched = setActiveExperimentSession(next);

              if (switched) {
                setActiveSessionId(next);
                setSelectedSnapshotId("");
                setRefreshTick((value) => value + 1);
                setMessage("Switched active experiment session.");
              }
            }}
          >
            {sessions.map((session) => (
              <option value={session.id} key={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.snapshotControls}>
          <label>
            New session name
            <input
              type="text"
              value={newSessionName}
              placeholder="e.g. Corner test Jan 2026"
              onChange={(event) => setNewSessionName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="cta ctaSecondary"
            onClick={() => {
              const created = createExperimentSession(newSessionName);
              setNewSessionName("");
              setActiveSessionId(created.id);
              setRefreshTick((value) => value + 1);
              setMessage(`Created and switched to session \"${created.name}\".`);
            }}
          >
            Create New Session
          </button>
          <label>
            Rename active session
            <input
              type="text"
              value={renameSessionName}
              onChange={(event) => setRenameSessionName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="cta ctaSecondary"
            disabled={!activeSession}
            onClick={() => {
              if (!activeSession) {
                return;
              }

              const renamed = renameExperimentSession(activeSession.id, renameSessionName);

              if (!renamed) {
                setMessage("Provide a valid non-empty session name.");
                return;
              }

              setRefreshTick((value) => value + 1);
              setMessage(`Renamed active session to \"${renamed.name}\".`);
            }}
          >
            Rename Session
          </button>
        </div>

        <p className={styles.meta}>{report.summary}</p>
        <p className={styles.meta}>
          Session run count: {runs.length}. Snapshot count in session: {snapshots.length}.
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
          Refresh Session Report
        </button>
        <button
          type="button"
          className="cta ctaSecondary"
          onClick={() => {
            const payload = {
              type: "bassbuddy.decision-report.v1",
              sessionId: activeSession?.id,
              sessionName: activeSession?.name,
              report,
              runsExport: exportRunsPayload(undefined, activeSessionId || undefined)
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

      <section className={`panel ${styles.snapshotPanel}`} style={{ marginTop: 12 }}>
        <h2 style={{ margin: 0 }}>Decision Snapshots</h2>
        <p className={styles.meta}>Save checkpoints and compare recommendation changes over time.</p>

        <div className={styles.snapshotControls}>
          <label>
            Snapshot label (optional)
            <input
              type="text"
              value={snapshotLabel}
              placeholder="e.g. After moving sub 1 ft"
              onChange={(event) => setSnapshotLabel(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="cta ctaSecondary"
            onClick={() => {
              const snapshot = saveDecisionSnapshot(report, runs.length, snapshotLabel, activeSessionId || undefined);
              setSnapshotLabel("");
              setSelectedSnapshotId(snapshot.id);
              setRefreshTick((value) => value + 1);
              setMessage("Saved decision snapshot.");
            }}
          >
            Save Snapshot
          </button>
        </div>

        {snapshots.length ? (
          <>
            <label>
              Saved snapshots
              <select value={selectedSnapshotId} onChange={(event) => setSelectedSnapshotId(event.target.value)}>
                {snapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {new Date(snapshot.createdAt).toLocaleString()} {snapshot.label ? `- ${snapshot.label}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedSnapshot ? (
              <article className={styles.snapshotCard}>
                <p className={styles.evidenceTitle}>Snapshot Details</p>
                <p className={styles.meta}>Date: {new Date(selectedSnapshot.createdAt).toLocaleString()}</p>
                {selectedSnapshot.label ? <p className={styles.meta}>Label: {selectedSnapshot.label}</p> : null}
                <p className={styles.meta}>
                  Overall: {selectedSnapshot.report.overallConfidence.toUpperCase()} ({selectedSnapshot.report.overallScore}/100)
                </p>
                <p className={styles.meta}>
                  Placement winner: {selectedSnapshot.report.placement.winner ?? "No winner"} | Phase winner:{" "}
                  {selectedSnapshot.report.phase.winner ?? "No winner"}
                </p>
                {snapshotDelta ? (
                  <>
                    <p className={styles.meta}>
                      Current vs snapshot score delta:{" "}
                      <strong
                        className={
                          snapshotDelta.overallScoreDelta >= 0 ? styles.deltaPositive : styles.deltaNegative
                        }
                      >
                        {formatDelta(snapshotDelta.overallScoreDelta)}
                      </strong>
                    </p>
                    <p className={styles.meta}>
                      Confidence changed: {snapshotDelta.overallConfidenceChanged ? "Yes" : "No"} | Placement changed:{" "}
                      {snapshotDelta.placementWinnerChanged ? "Yes" : "No"} | Phase changed:{" "}
                      {snapshotDelta.phaseWinnerChanged ? "Yes" : "No"}
                    </p>
                  </>
                ) : null}
                <div className={styles.snapshotControls}>
                  <button
                    type="button"
                    className="cta ctaSecondary"
                    onClick={() => {
                      downloadJson(`${filenameBase()}-snapshot.json`, {
                        type: "bassbuddy.decision-snapshot.v1",
                        sessionId: activeSession?.id,
                        sessionName: activeSession?.name,
                        snapshot: selectedSnapshot,
                        currentReport: report
                      });
                      setMessage("Exported selected snapshot JSON.");
                    }}
                  >
                    Export Selected Snapshot
                  </button>
                  <button
                    type="button"
                    className="cta ctaDanger"
                    onClick={() => {
                      if (!window.confirm("Delete selected decision snapshot?")) {
                        return;
                      }

                      const removed = deleteDecisionSnapshot(selectedSnapshot.id);

                      if (removed) {
                        setRefreshTick((value) => value + 1);
                        setMessage("Deleted selected snapshot.");
                      }
                    }}
                  >
                    Delete Selected Snapshot
                  </button>
                </div>
              </article>
            ) : null}

            <button
              type="button"
              className="cta ctaDanger"
              onClick={() => {
                if (!window.confirm("Clear all decision snapshots in this session?")) {
                  return;
                }

                const removed = clearDecisionSnapshots(activeSessionId || undefined);
                setRefreshTick((value) => value + 1);
                setMessage(`Cleared ${removed} decision snapshot${removed === 1 ? "" : "s"} in this session.`);
              }}
            >
              Clear Session Snapshots
            </button>
          </>
        ) : (
          <p className={styles.meta}>No snapshots saved yet.</p>
        )}
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
