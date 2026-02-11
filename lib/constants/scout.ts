export const SCOUT_MIN_CANDIDATES = 4;
export const SCOUT_MAX_CANDIDATES = 8;
export const SCOUT_DEFAULT_CANDIDATES = 6;

const SCOUT_LABEL_PREFIX = "Scout Location";

export function clampScoutCandidates(value: number): number {
  if (!Number.isFinite(value)) {
    return SCOUT_DEFAULT_CANDIDATES;
  }

  return Math.min(SCOUT_MAX_CANDIDATES, Math.max(SCOUT_MIN_CANDIDATES, Math.round(value)));
}

export function scoutLabel(index: number): string {
  return `${SCOUT_LABEL_PREFIX} ${index}`;
}

export function parseScoutLabel(label: string | null | undefined): number | null {
  if (!label) {
    return null;
  }

  const match = label.trim().match(/^Scout Location\s+(\d+)$/i);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function isScoutLabel(label: string | null | undefined): boolean {
  return parseScoutLabel(label) !== null;
}

