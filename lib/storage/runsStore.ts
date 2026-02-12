import type { BassRun, RunMode, RunsStoreV1 } from "@/lib/types";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";

export const RUNS_STORAGE_KEY = "subspot.v1.runs";
export const RUNS_STORE_VERSION = 1;
const MAX_RUNS = 50;
const VALID_MODES: RunMode[] = ["baseline", "ab", "phase", "multiseat", "scout"];

export interface RunsExportPayload {
  version: 1;
  exportedAt: string;
  runs: BassRun[];
}

export interface ImportRunsOptions {
  replaceExisting?: boolean;
}

export interface ImportRunsResult {
  added: number;
  replaced: number;
  total: number;
}

function emptyStore(): RunsStoreV1 {
  return {
    version: RUNS_STORE_VERSION,
    runs: []
  };
}

function isRunMode(value: string): value is RunMode {
  return VALID_MODES.includes(value as RunMode);
}

function sortByCreatedAtDesc(runs: BassRun[]): BassRun[] {
  return [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function normalizeRun(run: BassRun): BassRun {
  const mode = isRunMode(run.mode) ? run.mode : "baseline";
  const sessionId =
    typeof run.sessionId === "string" && run.sessionId.trim() ? run.sessionId : DEFAULT_EXPERIMENT_SESSION_ID;

  return {
    ...run,
    mode,
    sessionId
  };
}

function compactRuns(runs: BassRun[]): BassRun[] {
  const deduped = new Map<string, BassRun>();

  for (const run of sortByCreatedAtDesc(runs)) {
    const normalized = normalizeRun(run);

    if (!deduped.has(normalized.id)) {
      deduped.set(normalized.id, normalized);
    }
  }

  return Array.from(deduped.values()).slice(0, MAX_RUNS);
}

function parseRuns(raw: unknown): BassRun[] {
  if (Array.isArray(raw)) {
    return raw.filter((run): run is BassRun => Boolean(run && typeof run === "object" && typeof run.id === "string"));
  }

  if (!raw || typeof raw !== "object") {
    return [];
  }

  const candidate = raw as Partial<RunsStoreV1> & { runs?: unknown };

  if (!Array.isArray(candidate.runs)) {
    return [];
  }

  return candidate.runs.filter((run): run is BassRun => Boolean(run && typeof run === "object" && typeof run.id === "string"));
}

function migrateStore(raw: unknown): RunsStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<RunsStoreV1>;

  if (parsed.version === 1 && Array.isArray(parsed.runs)) {
    return {
      version: 1,
      runs: compactRuns(parseRuns(parsed.runs))
    };
  }

  return emptyStore();
}

function loadStore(): RunsStoreV1 {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  try {
    const raw = localStorage.getItem(RUNS_STORAGE_KEY);

    if (!raw) {
      return emptyStore();
    }

    const parsed = JSON.parse(raw) as unknown;
    return migrateStore(parsed);
  } catch {
    return emptyStore();
  }
}

function saveStore(store: RunsStoreV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify(store));
}

function writeRuns(runs: BassRun[]): void {
  const nextRuns = compactRuns(runs);

  if (!nextRuns.length) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(RUNS_STORAGE_KEY);
    }
    return;
  }

  saveStore({
    version: RUNS_STORE_VERSION,
    runs: nextRuns
  });
}

export function listRuns(mode?: RunMode, sessionId?: string): BassRun[] {
  const runs = loadStore().runs;
  const filtered = runs.filter((run) => {
    if (mode && run.mode !== mode) {
      return false;
    }

    if (sessionId && run.sessionId !== sessionId) {
      return false;
    }

    return true;
  });

  return sortByCreatedAtDesc(filtered);
}

export function getRunById(id: string): BassRun | undefined {
  return loadStore().runs.find((run) => run.id === id);
}

export function saveRun(run: BassRun): void {
  const store = loadStore();
  const deduped = store.runs.filter((entry) => entry.id !== run.id);
  writeRuns([run, ...deduped]);
}

export function updateRun(id: string, updater: (run: BassRun) => BassRun): BassRun | undefined {
  const store = loadStore();
  let updated: BassRun | undefined;

  const nextRuns = store.runs.map((run) => {
    if (run.id !== id) {
      return run;
    }

    updated = normalizeRun(updater(run));
    return updated;
  });

  if (!updated) {
    return undefined;
  }

  writeRuns(nextRuns);
  return updated;
}

export function deleteRun(id: string): boolean {
  const store = loadStore();
  const nextRuns = store.runs.filter((run) => run.id !== id);

  if (nextRuns.length === store.runs.length) {
    return false;
  }

  writeRuns(nextRuns);
  return true;
}

export function clearRuns(mode?: RunMode, sessionId?: string): number {
  if (mode || sessionId) {
    const store = loadStore();
    const nextRuns = store.runs.filter((run) => {
      const modeMatch = mode ? run.mode === mode : true;
      const sessionMatch = sessionId ? run.sessionId === sessionId : true;

      return !(modeMatch && sessionMatch);
    });
    const removedCount = store.runs.length - nextRuns.length;

    if (removedCount === 0) {
      return 0;
    }

    writeRuns(nextRuns);
    return removedCount;
  }

  if (typeof window === "undefined") {
    return 0;
  }

  const removedCount = loadStore().runs.length;
  localStorage.removeItem(RUNS_STORAGE_KEY);
  return removedCount;
}

export function exportRunsPayload(mode?: RunMode, sessionId?: string): RunsExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    runs: listRuns(mode, sessionId)
  };
}

function importRunsRaw(raw: unknown, options?: ImportRunsOptions): ImportRunsResult {
  const incoming = compactRuns(parseRuns(raw));
  const existing = loadStore().runs;

  if (!incoming.length) {
    if (options?.replaceExisting) {
      const replaced = clearRuns();

      return {
        added: 0,
        replaced,
        total: 0
      };
    }

    return {
      added: 0,
      replaced: 0,
      total: existing.length
    };
  }

  if (options?.replaceExisting) {
    writeRuns(incoming);

    return {
      added: incoming.length,
      replaced: existing.length,
      total: Math.min(incoming.length, MAX_RUNS)
    };
  }

  const existingIds = new Set(existing.map((run) => run.id));
  const merged = compactRuns([...incoming, ...existing]);
  const added = merged.filter((run) => !existingIds.has(run.id)).length;

  writeRuns(merged);

  return {
    added,
    replaced: 0,
    total: merged.length
  };
}

export function importRunsPayload(payload: unknown, options?: ImportRunsOptions): ImportRunsResult {
  const parsed = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && "runs" in payload
    ? (payload as { runs?: unknown }).runs
    : payload;
  return importRunsRaw(parsed, options);
}

export function importRunsJson(jsonText: string, options?: ImportRunsOptions): ImportRunsResult {
  const parsed = JSON.parse(jsonText) as unknown;
  return importRunsPayload(parsed, options);
}
