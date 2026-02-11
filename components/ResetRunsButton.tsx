"use client";

import { useEffect, useState } from "react";
import { clearRuns, listRuns } from "@/lib/storage/runsStore";
import type { RunMode } from "@/lib/types";

interface ResetRunsButtonProps {
  mode?: RunMode;
  sessionId?: string;
  className?: string;
  label?: string;
  onCleared?: () => void;
}

function scopeLabel(mode?: RunMode): string {
  if (!mode) {
    return "all saved runs";
  }

  if (mode === "ab") {
    return "all A/B runs";
  }

  if (mode === "phase") {
    return "all phase-test runs";
  }

  if (mode === "multiseat") {
    return "all multi-seat runs";
  }

  if (mode === "scout") {
    return "all placement-scout runs";
  }

  return "all baseline runs";
}

function scopeSuffix(sessionId?: string): string {
  return sessionId ? " in the active session" : "";
}

export function ResetRunsButton({ mode, sessionId, className, label, onCleared }: ResetRunsButtonProps) {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCount(listRuns(mode, sessionId).length);
  }, [mode, sessionId]);

  const buttonLabel = label ?? (mode ? "Start Fresh (This Mode)" : "Start Fresh (Delete All Runs)");

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        className={className ?? "cta ctaDanger"}
        disabled={count === 0}
        onClick={() => {
          const currentCount = listRuns(mode, sessionId).length;

          if (currentCount === 0) {
            setMessage("No saved runs to delete.");
            return;
          }

          const shouldDelete = window.confirm(
            `Delete ${scopeLabel(mode)}${scopeSuffix(sessionId)}? This removes ${currentCount} run${currentCount === 1 ? "" : "s"} permanently.`
          );

          if (!shouldDelete) {
            return;
          }

          const removed = clearRuns(mode, sessionId);
          setCount(listRuns(mode, sessionId).length);
          setMessage(`Deleted ${removed} run${removed === 1 ? "" : "s"}.`);
          onCleared?.();
        }}
      >
        {buttonLabel}
      </button>
      {message ? <p className="muted" style={{ margin: 0 }}>{message}</p> : null}
    </div>
  );
}
