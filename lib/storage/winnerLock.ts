import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";

export const WINNER_LOCKS_STORAGE_KEY = "bassbuddy.v1.winnerLocks";
export const WINNER_LOCKS_VERSION = 1;
const MAX_WINNER_LOCKS = 50;
const MAX_WINNER_LOCK_HISTORY = 500;

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

export interface WinnerLockHistoryEntryV1 {
  id: string;
  sessionId: string;
  placementWinner?: string;
  phaseWinner?: string;
  notes?: string;
  source: WinnerLockSource;
  createdAt: string;
}

interface WinnerLocksStoreV1 {
  version: 1;
  locks: WinnerLockV1[];
  history: WinnerLockHistoryEntryV1[];
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
  history: WinnerLockHistoryEntryV1[];
}

export interface ImportWinnerLocksOptions {
  replaceExisting?: boolean;
}

export interface ImportWinnerLocksResult {
  added: number;
  replaced: number;
  total: number;
}

export interface ClearWinnerLocksOptions {
  includeHistory?: boolean;
}

function emptyStore(): WinnerLocksStoreV1 {
  return {
    version: WINNER_LOCKS_VERSION,
    locks: [],
    history: []
  };
}

function sortLocks(locks: WinnerLockV1[]): WinnerLockV1[] {
  return [...locks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function sortHistory(entries: WinnerLockHistoryEntryV1[]): WinnerLockHistoryEntryV1[] {
  return [...entries].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

function compactHistory(entries: WinnerLockHistoryEntryV1[]): WinnerLockHistoryEntryV1[] {
  const deduped = new Map<string, WinnerLockHistoryEntryV1>();

  for (const entry of sortHistory(entries)) {
    if (!deduped.has(entry.id)) {
      deduped.set(entry.id, entry);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_WINNER_LOCK_HISTORY);
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

function parseHistoryEntry(raw: unknown): WinnerLockHistoryEntryV1 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<WinnerLockHistoryEntryV1>;
  const now = new Date().toISOString();
  const sessionId = normalizeSessionId(candidate.sessionId);
  const createdAt = typeof candidate.createdAt === "string" ? candidate.createdAt : now;
  const source = parseSource(candidate.source);
  const fallbackId = `${sessionId}-${createdAt}-${source}`;

  return {
    id:
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id
        : fallbackId,
    sessionId,
    placementWinner: normalizeOptionalText(candidate.placementWinner),
    phaseWinner: normalizeOptionalText(candidate.phaseWinner),
    notes: normalizeOptionalText(candidate.notes),
    source,
    createdAt
  };
}

function parseLocks(raw: unknown): WinnerLockV1[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(parseLock).filter((entry): entry is WinnerLockV1 => Boolean(entry));
}

function parseHistory(raw: unknown): WinnerLockHistoryEntryV1[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(parseHistoryEntry).filter((entry): entry is WinnerLockHistoryEntryV1 => Boolean(entry));
}

function makeHistoryEntry(lock: WinnerLockV1): WinnerLockHistoryEntryV1 {
  return {
    id: crypto.randomUUID(),
    sessionId: lock.sessionId,
    placementWinner: lock.placementWinner,
    phaseWinner: lock.phaseWinner,
    notes: lock.notes,
    source: lock.source,
    createdAt: lock.updatedAt
  };
}

function migrateStore(raw: unknown): WinnerLocksStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<WinnerLocksStoreV1> & { history?: unknown };

  if (parsed.version === 1 && Array.isArray(parsed.locks)) {
    return {
      version: 1,
      locks: compactLocks(parseLocks(parsed.locks)),
      history: compactHistory(parseHistory(parsed.history))
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

function writeStore(locks: WinnerLockV1[], history: WinnerLockHistoryEntryV1[]): void {
  const nextLocks = compactLocks(locks);
  const nextHistory = compactHistory(history);

  if (!nextLocks.length && !nextHistory.length) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(WINNER_LOCKS_STORAGE_KEY);
    }
    return;
  }

  saveStore({
    version: WINNER_LOCKS_VERSION,
    locks: nextLocks,
    history: nextHistory
  });
}

export function listWinnerLocks(): WinnerLockV1[] {
  return sortLocks(loadStore().locks);
}

export function listWinnerLockHistory(sessionId?: string): WinnerLockHistoryEntryV1[] {
  const history = sortHistory(loadStore().history);

  if (!sessionId) {
    return history;
  }

  const resolvedSessionId = normalizeSessionId(sessionId);
  return history.filter((entry) => entry.sessionId === resolvedSessionId);
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
  const nextHistoryEntry = makeHistoryEntry(next);
  writeStore([next, ...remainder], [nextHistoryEntry, ...store.history]);
  return next;
}

export function clearWinnerLocks(sessionId?: string, options?: ClearWinnerLocksOptions): number {
  const store = loadStore();
  const includeHistory = options?.includeHistory ?? true;

  if (!sessionId) {
    if (typeof window === "undefined") {
      return 0;
    }

    const removed = store.locks.length;

    if (includeHistory) {
      localStorage.removeItem(WINNER_LOCKS_STORAGE_KEY);
      return removed;
    }

    writeStore([], store.history);
    return removed;
  }

  const resolvedSessionId = normalizeSessionId(sessionId);
  const nextLocks = store.locks.filter((entry) => entry.sessionId !== resolvedSessionId);
  const removed = store.locks.length - nextLocks.length;

  if (!removed && (!includeHistory || !store.history.some((entry) => entry.sessionId === resolvedSessionId))) {
    return 0;
  }

  const nextHistory = includeHistory
    ? store.history.filter((entry) => entry.sessionId !== resolvedSessionId)
    : store.history;

  writeStore(nextLocks, nextHistory);
  return removed;
}

export function exportWinnerLocksPayload(): WinnerLocksExportPayload {
  return {
    version: 1,
    locks: listWinnerLocks(),
    history: listWinnerLockHistory()
  };
}

function parseImportPayload(
  payload: unknown
): { locks: WinnerLockV1[]; history: WinnerLockHistoryEntryV1[] } {
  if (Array.isArray(payload)) {
    return {
      locks: compactLocks(parseLocks(payload)),
      history: []
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      locks: [],
      history: []
    };
  }

  const parsed = payload as Partial<WinnerLocksStoreV1> & { locks?: unknown; history?: unknown };

  return {
    locks: compactLocks(parseLocks(parsed.locks)),
    history: compactHistory(parseHistory(parsed.history))
  };
}

export function importWinnerLocksPayload(
  payload: unknown,
  options?: ImportWinnerLocksOptions
): ImportWinnerLocksResult {
  const incoming = parseImportPayload(payload);
  const existing = loadStore();

  if (options?.replaceExisting) {
    writeStore(incoming.locks, incoming.history);

    return {
      added: incoming.locks.length,
      replaced: existing.locks.length,
      total: incoming.locks.length
    };
  }

  if (!incoming.locks.length && !incoming.history.length) {
    return {
      added: 0,
      replaced: 0,
      total: existing.locks.length
    };
  }

  const existingSessionIds = new Set(existing.locks.map((entry) => entry.sessionId));
  const mergedLocks = compactLocks([...incoming.locks, ...existing.locks]);
  const mergedHistory = compactHistory([...incoming.history, ...existing.history]);
  const added = mergedLocks.filter((entry) => !existingSessionIds.has(entry.sessionId)).length;
  const replaced = incoming.locks.filter((entry) => existingSessionIds.has(entry.sessionId)).length;

  writeStore(mergedLocks, mergedHistory);

  return {
    added,
    replaced,
    total: mergedLocks.length
  };
}
