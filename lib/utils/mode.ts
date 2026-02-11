import type { RunMode } from "@/lib/types";

export function normalizeMode(mode: string | null | undefined): RunMode {
  if (mode === "ab" || mode === "phase" || mode === "multiseat") {
    return mode;
  }

  return "baseline";
}

export function modeTitle(mode: RunMode): string {
  switch (mode) {
    case "ab":
      return "Compare Two Placements (A/B)";
    case "phase":
      return "Phase Test (0 vs 180)";
    case "multiseat":
      return "Multi-Seat Compromise (A/B)";
    default:
      return "Quick Baseline Measurement";
  }
}

export function modeShortLabel(mode: RunMode): string {
  switch (mode) {
    case "ab":
      return "Placement Compare";
    case "phase":
      return "Phase Compare";
    case "multiseat":
      return "Multi-Seat";
    default:
      return "Baseline";
  }
}
