"use client";

import { useEffect, useRef, useState } from "react";
import { clearDecisionSnapshots } from "@/lib/storage/decisionSnapshots";
import { resetExperimentSessions } from "@/lib/storage/experimentSessions";
import { clearGuidedSession } from "@/lib/storage/guidedSession";
import { exportSessionBundle, importSessionBundleJson } from "@/lib/storage/sessionBundle";
import { clearRuns, listRuns } from "@/lib/storage/runsStore";

interface SessionToolsProps {
  onChanged?: () => void;
}

function suggestedFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `bassbuddy-session-bundle-${yyyy}${mm}${dd}.json`;
}

export function SessionTools({ onChanged }: SessionToolsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [totalRuns, setTotalRuns] = useState<number | null>(null);

  useEffect(() => {
    const refreshTotalRuns = () => {
      setTotalRuns(listRuns().length);
    };

    refreshTotalRuns();
    window.addEventListener("focus", refreshTotalRuns);
    window.addEventListener("storage", refreshTotalRuns);

    return () => {
      window.removeEventListener("focus", refreshTotalRuns);
      window.removeEventListener("storage", refreshTotalRuns);
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        className="cta ctaDanger"
        onClick={() => {
          const runCount = listRuns().length;
          const confirmed = window.confirm(
            `Start a fresh session? This deletes ${runCount} saved run${runCount === 1 ? "" : "s"}, clears guided progress, and clears decision snapshots.`
          );

          if (!confirmed) {
            return;
          }

          const removed = clearRuns();
          const removedSnapshots = clearDecisionSnapshots();
          resetExperimentSessions();
          clearGuidedSession();
          setTotalRuns(listRuns().length);
          onChanged?.();
          setMessage(
            `Fresh session started. Deleted ${removed} run${removed === 1 ? "" : "s"}, ${removedSnapshots} snapshot${removedSnapshots === 1 ? "" : "s"}, and reset experiment sessions.`
          );
        }}
      >
        Start Fresh Session
      </button>

      <button
        type="button"
        className="cta ctaSecondary"
        onClick={() => {
          const payload = exportSessionBundle();
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = suggestedFilename();
          anchor.click();
          URL.revokeObjectURL(url);
          const runCount = payload.runs.runs.length;
          const sessionCount = payload.experimentSessions.sessions.length;
          const snapshotCount = payload.decisionSnapshots.snapshots.length;
          setMessage(
            `Exported full bundle: ${runCount} run${runCount === 1 ? "" : "s"}, ${sessionCount} session${sessionCount === 1 ? "" : "s"}, ${snapshotCount} snapshot${snapshotCount === 1 ? "" : "s"}.`
          );
        }}
      >
        Export Full Session Bundle (JSON)
      </button>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="muted">Import options</span>
        <select
          value={replaceExisting ? "replace" : "merge"}
          onChange={(event) => setReplaceExisting(event.target.value === "replace")}
        >
          <option value="merge">Merge with existing local data</option>
          <option value="replace">Replace all local data</option>
        </select>
      </label>

      <input ref={fileInputRef} type="file" accept="application/json,.json" />

      <button
        type="button"
        className="cta ctaSecondary"
        disabled={busy}
        onClick={async () => {
          const file = fileInputRef.current?.files?.[0];

          if (!file) {
            setMessage("Choose a JSON file first.");
            return;
          }

          setBusy(true);
          try {
            const text = await file.text();
            const result = importSessionBundleJson(text, { replaceExisting });
            setTotalRuns(listRuns().length);
            onChanged?.();
            if (result.format === "runs-legacy") {
              setMessage(
                replaceExisting
                  ? `Imported legacy runs-only JSON: replaced ${result.runs.replaced} run${result.runs.replaced === 1 ? "" : "s"}, now ${result.runs.total} total.`
                  : `Imported legacy runs-only JSON: +${result.runs.added} run${result.runs.added === 1 ? "" : "s"} (total ${result.runs.total}).`
              );
            } else {
              setMessage(
                replaceExisting
                  ? `Imported full bundle (replace): ${result.runs.total} runs, ${result.sessions.total} sessions, ${result.decisionSnapshots.total} snapshots.`
                  : `Imported full bundle (merge): +${result.runs.added} runs, +${result.sessions.added} sessions, +${result.decisionSnapshots.added} snapshots.`
              );
            }
          } catch (error) {
            const detail = error instanceof Error ? error.message : "Unknown parse error.";
            setMessage(`Import failed: ${detail}`);
          } finally {
            setBusy(false);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }
        }}
      >
        {busy ? "Importing..." : "Import Session JSON"}
      </button>

      <p className="muted" style={{ margin: 0 }}>
        Total saved runs: {totalRuns === null ? "..." : totalRuns}
      </p>
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
