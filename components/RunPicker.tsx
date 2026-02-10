import type { BassRun } from "@/lib/types";

interface RunPickerProps {
  id: string;
  label: string;
  runs: BassRun[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function RunPicker({ id, label, runs, selectedId, onSelect }: RunPickerProps) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span>{label}</span>
      <select id={id} value={selectedId} onChange={(event) => onSelect(event.target.value)}>
        {runs.map((run) => {
          const date = new Date(run.createdAt).toLocaleString();
          const runLabel = run.label ?? "Unlabeled run";

          return (
            <option key={run.id} value={run.id}>
              {runLabel} - {date}
            </option>
          );
        })}
      </select>
    </label>
  );
}
