import type { DecisionReport } from "@/lib/utils/decisionAssistant";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";

export const DECISION_SNAPSHOTS_STORAGE_KEY = "bassbuddy.v1.decisionSnapshots";
export const DECISION_SNAPSHOTS_VERSION = 1;
const MAX_SNAPSHOTS = 30;

export interface DecisionSnapshotV1 {
  id: string;
  createdAt: string;
  label?: string;
  sessionId: string;
  runCount: number;
  report: DecisionReport;
}

interface DecisionSnapshotsStoreV1 {
  version: 1;
  snapshots: DecisionSnapshotV1[];
}

export interface DecisionSnapshotsExportPayload {
  version: 1;
  snapshots: DecisionSnapshotV1[];
}

export interface ImportDecisionSnapshotsOptions {
  replaceExisting?: boolean;
}

export interface ImportDecisionSnapshotsResult {
  added: number;
  replaced: number;
  total: number;
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
      sessionId:
        typeof entry.sessionId === "string" && entry.sessionId.trim()
          ? entry.sessionId
          : DEFAULT_EXPERIMENT_SESSION_ID,
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

function parseImportPayload(payload: unknown): DecisionSnapshotV1[] {
  if (Array.isArray(payload)) {
    return compactSnapshots(parseSnapshots(payload));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const parsed = payload as Partial<DecisionSnapshotsStoreV1> & { snapshots?: unknown };
  return compactSnapshots(parseSnapshots(parsed.snapshots));
}

export function listDecisionSnapshots(sessionId?: string): DecisionSnapshotV1[] {
  const snapshots = loadStore().snapshots;

  if (!sessionId) {
    return sortSnapshots(snapshots);
  }

  return sortSnapshots(snapshots.filter((snapshot) => snapshot.sessionId === sessionId));
}

export function exportDecisionSnapshotsPayload(): DecisionSnapshotsExportPayload {
  return {
    version: 1,
    snapshots: listDecisionSnapshots()
  };
}

export function importDecisionSnapshotsPayload(
  payload: unknown,
  options?: ImportDecisionSnapshotsOptions
): ImportDecisionSnapshotsResult {
  const incoming = parseImportPayload(payload);
  const existing = loadStore().snapshots;

  if (options?.replaceExisting) {
    writeSnapshots(incoming);

    return {
      added: incoming.length,
      replaced: existing.length,
      total: incoming.length
    };
  }

  if (!incoming.length) {
    return {
      added: 0,
      replaced: 0,
      total: existing.length
    };
  }

  const existingIds = new Set(existing.map((snapshot) => snapshot.id));
  const merged = compactSnapshots([...incoming, ...existing]);
  const added = merged.filter((snapshot) => !existingIds.has(snapshot.id)).length;
  const replaced = incoming.filter((snapshot) => existingIds.has(snapshot.id)).length;

  writeSnapshots(merged);

  return {
    added,
    replaced,
    total: merged.length
  };
}

export function saveDecisionSnapshot(
  report: DecisionReport,
  runCount: number,
  label?: string,
  sessionId?: string
): DecisionSnapshotV1 {
  const snapshot: DecisionSnapshotV1 = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: label?.trim() || undefined,
    sessionId:
      typeof sessionId === "string" && sessionId.trim() ? sessionId : DEFAULT_EXPERIMENT_SESSION_ID,
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

export function clearDecisionSnapshots(sessionId?: string): number {
  const store = loadStore();

  if (!sessionId) {
    if (typeof window === "undefined") {
      return 0;
    }

    const removedAll = store.snapshots.length;
    localStorage.removeItem(DECISION_SNAPSHOTS_STORAGE_KEY);
    return removedAll;
  }

  const next = store.snapshots.filter((snapshot) => snapshot.sessionId !== sessionId);
  const removed = store.snapshots.length - next.length;

  if (removed === 0) {
    return 0;
  }

  writeSnapshots(next);
  return removed;
}
