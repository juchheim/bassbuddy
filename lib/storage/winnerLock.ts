import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";

export const WINNER_LOCKS_STORAGE_KEY = "bassbuddy.v1.winnerLocks";
export const WINNER_LOCKS_VERSION = 1;
const MAX_WINNER_LOCKS = 50;

export type WinnerLockSource = "compare" | "decision";

export interface WinnerLockV1 {
  sessionId: string;
  placementWinner?: string;
  phaseWinner?: string;
  notes?: string;
  source: WinnerLockSource;
  createdAt: string;
  updatedAt: string;
}

interface WinnerLocksStoreV1 {
  version: 1;
  locks: WinnerLockV1[];
}

export interface SaveWinnerLockInput {
  sessionId?: string;
  placementWinner?: string | null;
  phaseWinner?: string | null;
  notes?: string | null;
  source?: WinnerLockSource;
}

export interface WinnerLocksExportPayload {
  version: 1;
  locks: WinnerLockV1[];
}

export interface ImportWinnerLocksOptions {
  replaceExisting?: boolean;
}

export interface ImportWinnerLocksResult {
  added: number;
  replaced: number;
  total: number;
}

function emptyStore(): WinnerLocksStoreV1 {
  return {
    version: WINNER_LOCKS_VERSION,
    locks: []
  };
}

function sortLocks(locks: WinnerLockV1[]): WinnerLockV1[] {
  return [...locks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function compactLocks(locks: WinnerLockV1[]): WinnerLockV1[] {
  const deduped = new Map<string, WinnerLockV1>();

  for (const entry of sortLocks(locks)) {
    if (!deduped.has(entry.sessionId)) {
      deduped.set(entry.sessionId, entry);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_WINNER_LOCKS);
}

function normalizeSessionId(sessionId: unknown): string {
  if (typeof sessionId === "string" && sessionId.trim()) {
    return sessionId;
  }

  return DEFAULT_EXPERIMENT_SESSION_ID;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseSource(value: unknown): WinnerLockSource {
  return value === "compare" || value === "decision" ? value : "decision";
}

function parseLock(raw: unknown): WinnerLockV1 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<WinnerLockV1>;
  const now = new Date().toISOString();

  return {
    sessionId: normalizeSessionId(candidate.sessionId),
    placementWinner: normalizeOptionalText(candidate.placementWinner),
    phaseWinner: normalizeOptionalText(candidate.phaseWinner),
    notes: normalizeOptionalText(candidate.notes),
    source: parseSource(candidate.source),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now
  };
}

function parseLocks(raw: unknown): WinnerLockV1[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(parseLock).filter((entry): entry is WinnerLockV1 => Boolean(entry));
}

function migrateStore(raw: unknown): WinnerLocksStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<WinnerLocksStoreV1>;

  if (parsed.version === 1 && Array.isArray(parsed.locks)) {
    return {
      version: 1,
      locks: compactLocks(parseLocks(parsed.locks))
    };
  }

  return emptyStore();
}

function loadStore(): WinnerLocksStoreV1 {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  try {
    const raw = localStorage.getItem(WINNER_LOCKS_STORAGE_KEY);

    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw) as unknown;
    return migrateStore(parsed);
  } catch {
    return emptyStore();
  }
}

function saveStore(store: WinnerLocksStoreV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(WINNER_LOCKS_STORAGE_KEY, JSON.stringify(store));
}

function writeLocks(locks: WinnerLockV1[]): void {
  const next = compactLocks(locks);

  if (!next.length) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(WINNER_LOCKS_STORAGE_KEY);
    }
    return;
  }

  saveStore({
    version: WINNER_LOCKS_VERSION,
    locks: next
  });
}

export function listWinnerLocks(): WinnerLockV1[] {
  return sortLocks(loadStore().locks);
}

export function getWinnerLock(sessionId?: string): WinnerLockV1 | null {
  const resolvedSessionId = normalizeSessionId(sessionId);
  return loadStore().locks.find((entry) => entry.sessionId === resolvedSessionId) ?? null;
}

export function saveWinnerLock(input: SaveWinnerLockInput): WinnerLockV1 | null {
  const store = loadStore();
  const sessionId = normalizeSessionId(input.sessionId);
  const existing = store.locks.find((entry) => entry.sessionId === sessionId) ?? null;
  const now = new Date().toISOString();

  const placementWinner =
    input.placementWinner === null
      ? undefined
      : normalizeOptionalText(input.placementWinner) ?? existing?.placementWinner;
  const phaseWinner =
    input.phaseWinner === null ? undefined : normalizeOptionalText(input.phaseWinner) ?? existing?.phaseWinner;
  const notes = input.notes === null ? undefined : normalizeOptionalText(input.notes) ?? existing?.notes;

  if (!placementWinner && !phaseWinner && !notes) {
    return null;
  }

  const next: WinnerLockV1 = {
    sessionId,
    placementWinner,
    phaseWinner,
    notes,
    source: parseSource(input.source),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const remainder = store.locks.filter((entry) => entry.sessionId !== sessionId);
  writeLocks([next, ...remainder]);
  return next;
}

export function clearWinnerLocks(sessionId?: string): number {
  const store = loadStore();

  if (!sessionId) {
    if (typeof window === "undefined") {
      return 0;
    }

    const removed = store.locks.length;
    localStorage.removeItem(WINNER_LOCKS_STORAGE_KEY);
    return removed;
  }

  const resolvedSessionId = normalizeSessionId(sessionId);
  const next = store.locks.filter((entry) => entry.sessionId !== resolvedSessionId);
  const removed = store.locks.length - next.length;

  if (!removed) {
    return 0;
  }

  writeLocks(next);
  return removed;
}

export function exportWinnerLocksPayload(): WinnerLocksExportPayload {
  return {
    version: 1,
    locks: listWinnerLocks()
  };
}

function parseImportPayload(payload: unknown): WinnerLockV1[] {
  if (Array.isArray(payload)) {
    return compactLocks(parseLocks(payload));
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const parsed = payload as Partial<WinnerLocksStoreV1> & { locks?: unknown };
  return compactLocks(parseLocks(parsed.locks));
}

export function importWinnerLocksPayload(
  payload: unknown,
  options?: ImportWinnerLocksOptions
): ImportWinnerLocksResult {
  const incoming = parseImportPayload(payload);
  const existing = loadStore().locks;

  if (options?.replaceExisting) {
    writeLocks(incoming);

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

  const existingSessionIds = new Set(existing.map((entry) => entry.sessionId));
  const merged = compactLocks([...incoming, ...existing]);
  const added = merged.filter((entry) => !existingSessionIds.has(entry.sessionId)).length;
  const replaced = incoming.filter((entry) => existingSessionIds.has(entry.sessionId)).length;

  writeLocks(merged);

  return {
    added,
    replaced,
    total: merged.length
  };
}
