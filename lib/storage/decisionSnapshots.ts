import type { DecisionReport } from "@/lib/utils/decisionAssistant";

export const DECISION_SNAPSHOTS_STORAGE_KEY = "bassbuddy.v1.decisionSnapshots";
export const DECISION_SNAPSHOTS_VERSION = 1;
const MAX_SNAPSHOTS = 30;

export interface DecisionSnapshotV1 {
  id: string;
  createdAt: string;
  label?: string;
  runCount: number;
  report: DecisionReport;
}

interface DecisionSnapshotsStoreV1 {
  version: 1;
  snapshots: DecisionSnapshotV1[];
}

function emptyStore(): DecisionSnapshotsStoreV1 {
  return {
    version: DECISION_SNAPSHOTS_VERSION,
    snapshots: []
  };
}

function sortSnapshots(snapshots: DecisionSnapshotV1[]): DecisionSnapshotV1[] {
  return [...snapshots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function compactSnapshots(snapshots: DecisionSnapshotV1[]): DecisionSnapshotV1[] {
  const deduped = new Map<string, DecisionSnapshotV1>();

  for (const snapshot of sortSnapshots(snapshots)) {
    if (!deduped.has(snapshot.id)) {
      deduped.set(snapshot.id, snapshot);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_SNAPSHOTS);
}

function parseSnapshots(raw: unknown): DecisionSnapshotV1[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (entry): entry is DecisionSnapshotV1 =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof (entry as DecisionSnapshotV1).id === "string" &&
            typeof (entry as DecisionSnapshotV1).createdAt === "string" &&
            typeof (entry as DecisionSnapshotV1).report === "object"
        )
    )
    .map((entry) => ({
      ...entry,
      runCount: typeof entry.runCount === "number" ? entry.runCount : 0,
      label: typeof entry.label === "string" ? entry.label : undefined
    }));
}

function migrateStore(raw: unknown): DecisionSnapshotsStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<DecisionSnapshotsStoreV1>;

  if (parsed.version === 1 && Array.isArray(parsed.snapshots)) {
    return {
      version: 1,
      snapshots: compactSnapshots(parseSnapshots(parsed.snapshots))
    };
  }

  return emptyStore();
}

function loadStore(): DecisionSnapshotsStoreV1 {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  try {
    const raw = localStorage.getItem(DECISION_SNAPSHOTS_STORAGE_KEY);

    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw) as unknown;
    return migrateStore(parsed);
  } catch {
    return emptyStore();
  }
}

function saveStore(store: DecisionSnapshotsStoreV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(DECISION_SNAPSHOTS_STORAGE_KEY, JSON.stringify(store));
}

function writeSnapshots(snapshots: DecisionSnapshotV1[]): void {
  const next = compactSnapshots(snapshots);

  if (!next.length) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(DECISION_SNAPSHOTS_STORAGE_KEY);
    }
    return;
  }

  saveStore({
    version: DECISION_SNAPSHOTS_VERSION,
    snapshots: next
  });
}

export function listDecisionSnapshots(): DecisionSnapshotV1[] {
  return sortSnapshots(loadStore().snapshots);
}

export function saveDecisionSnapshot(
  report: DecisionReport,
  runCount: number,
  label?: string
): DecisionSnapshotV1 {
  const snapshot: DecisionSnapshotV1 = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: label?.trim() || undefined,
    runCount,
    report
  };

  const store = loadStore();
  writeSnapshots([snapshot, ...store.snapshots]);
  return snapshot;
}

export function deleteDecisionSnapshot(id: string): boolean {
  const store = loadStore();
  const next = store.snapshots.filter((snapshot) => snapshot.id !== id);

  if (next.length === store.snapshots.length) {
    return false;
  }

  writeSnapshots(next);
  return true;
}

export function clearDecisionSnapshots(): number {
  if (typeof window === "undefined") {
    return 0;
  }

  const removed = loadStore().snapshots.length;
  localStorage.removeItem(DECISION_SNAPSHOTS_STORAGE_KEY);
  return removed;
}

