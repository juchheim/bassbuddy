"use client";

import { useEffect, useState } from "react";
import { clearRuns, listRuns } from "@/lib/storage/runsStore";
import type { RunMode } from "@/lib/types";

interface ResetRunsButtonProps {
  mode?: RunMode;
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

  return "all baseline runs";
}

export function ResetRunsButton({ mode, className, label, onCleared }: ResetRunsButtonProps) {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCount(listRuns(mode).length);
  }, [mode]);

  const buttonLabel = label ?? (mode ? "Start Fresh (This Mode)" : "Start Fresh (Delete All Runs)");

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        className={className ?? "cta ctaDanger"}
        disabled={count === 0}
        onClick={() => {
          const currentCount = listRuns(mode).length;

          if (currentCount === 0) {
            setMessage("No saved runs to delete.");
            return;
          }

          const shouldDelete = window.confirm(
            `Delete ${scopeLabel(mode)}? This removes ${currentCount} run${currentCount === 1 ? "" : "s"} permanently.`
          );

          if (!shouldDelete) {
            return;
          }

          const removed = clearRuns(mode);
          setCount(listRuns(mode).length);
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
