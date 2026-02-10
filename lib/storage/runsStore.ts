import type { BassRun, RunMode, RunsStoreV1 } from "@/lib/types";

export const RUNS_STORAGE_KEY = "bassbuddy.v1.runs";
export const RUNS_STORE_VERSION = 1;
const MAX_RUNS = 50;

function emptyStore(): RunsStoreV1 {
  return {
    version: RUNS_STORE_VERSION,
    runs: []
  };
}

function migrateStore(raw: unknown): RunsStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<RunsStoreV1>;

  if (parsed.version === 1 && Array.isArray(parsed.runs)) {
    const runs = parsed.runs
      .filter((run): run is BassRun => Boolean(run && typeof run.id === "string" && Array.isArray(run.measurements)))
      .slice(0, MAX_RUNS);

    return {
      version: 1,
      runs
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

export function listRuns(mode?: RunMode): BassRun[] {
  const runs = loadStore().runs;
  const filtered = mode ? runs.filter((run) => run.mode === mode) : runs;

  return [...filtered].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function getRunById(id: string): BassRun | undefined {
  return loadStore().runs.find((run) => run.id === id);
}

export function saveRun(run: BassRun): void {
  const store = loadStore();
  const deduped = store.runs.filter((entry) => entry.id !== run.id);
  const nextRuns = [run, ...deduped].slice(0, MAX_RUNS);

  saveStore({
    version: RUNS_STORE_VERSION,
    runs: nextRuns
  });
}

export function updateRun(id: string, updater: (run: BassRun) => BassRun): BassRun | undefined {
  const store = loadStore();
  let updated: BassRun | undefined;

  const nextRuns = store.runs.map((run) => {
    if (run.id !== id) {
      return run;
    }

    updated = updater(run);
    return updated;
  });

  if (!updated) {
    return undefined;
  }

  saveStore({
    version: RUNS_STORE_VERSION,
    runs: nextRuns
  });

  return updated;
}

export function deleteRun(id: string): boolean {
  const store = loadStore();
  const nextRuns = store.runs.filter((run) => run.id !== id);

  if (nextRuns.length === store.runs.length) {
    return false;
  }

  if (!nextRuns.length) {
    if (typeof window !== "undefined") {
      localStorage.removeItem(RUNS_STORAGE_KEY);
    }
    return true;
  }

  saveStore({
    version: RUNS_STORE_VERSION,
    runs: nextRuns
  });

  return true;
}

export function clearRuns(mode?: RunMode): number {
  if (mode) {
    const store = loadStore();
    const nextRuns = store.runs.filter((run) => run.mode !== mode);
    const removedCount = store.runs.length - nextRuns.length;

    if (removedCount === 0) {
      return 0;
    }

    if (!nextRuns.length) {
      if (typeof window !== "undefined") {
        localStorage.removeItem(RUNS_STORAGE_KEY);
      }
      return removedCount;
    }

    saveStore({
      version: RUNS_STORE_VERSION,
      runs: nextRuns
    });

    return removedCount;
  }

  if (typeof window === "undefined") {
    return 0;
  }

  const removedCount = loadStore().runs.length;
  localStorage.removeItem(RUNS_STORAGE_KEY);
  return removedCount;
}
