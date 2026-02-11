"use client";

import { useMemo, useRef, useState } from "react";
import { clearDecisionSnapshots } from "@/lib/storage/decisionSnapshots";
import { resetExperimentSessions } from "@/lib/storage/experimentSessions";
import { clearGuidedSession } from "@/lib/storage/guidedSession";
import { clearRuns, exportRunsPayload, importRunsJson, listRuns } from "@/lib/storage/runsStore";

function suggestedFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `bassbuddy-runs-${yyyy}${mm}${dd}.json`;
}

export function SessionTools() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const totalRuns = useMemo(() => listRuns().length, [message]);

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
          const payload = exportRunsPayload();
          const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = suggestedFilename();
          anchor.click();
          URL.revokeObjectURL(url);
          setMessage(`Exported ${payload.runs.length} run${payload.runs.length === 1 ? "" : "s"} to JSON.`);
        }}
      >
        Export Runs (JSON)
      </button>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="muted">Import options</span>
        <select
          value={replaceExisting ? "replace" : "merge"}
          onChange={(event) => setReplaceExisting(event.target.value === "replace")}
        >
          <option value="merge">Merge with existing runs</option>
          <option value="replace">Replace existing runs</option>
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
            const result = importRunsJson(text, { replaceExisting });
            setMessage(
              replaceExisting
                ? `Imported ${result.added} run${result.added === 1 ? "" : "s"} (replaced ${result.replaced}).`
                : `Imported ${result.added} new run${result.added === 1 ? "" : "s"} (total ${result.total}).`
            );
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
        {busy ? "Importing..." : "Import Runs (JSON)"}
      </button>

      <p className="muted" style={{ margin: 0 }}>
        Total saved runs: {totalRuns}
      </p>
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
