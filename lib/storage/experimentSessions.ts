import {
  DEFAULT_EXPERIMENT_SESSION_ID,
  DEFAULT_EXPERIMENT_SESSION_NAME,
  EXPERIMENT_SESSIONS_STORAGE_KEY,
  EXPERIMENT_SESSIONS_VERSION
} from "@/lib/constants/sessions";

const MAX_EXPERIMENT_SESSIONS = 25;

export interface ExperimentSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ExperimentSessionsStoreV1 {
  version: 1;
  sessions: ExperimentSession[];
  activeSessionId: string;
}

function defaultSession(): ExperimentSession {
  const now = new Date().toISOString();

  return {
    id: DEFAULT_EXPERIMENT_SESSION_ID,
    name: DEFAULT_EXPERIMENT_SESSION_NAME,
    createdAt: now,
    updatedAt: now
  };
}

function emptyStore(): ExperimentSessionsStoreV1 {
  const fallback = defaultSession();

  return {
    version: EXPERIMENT_SESSIONS_VERSION,
    sessions: [fallback],
    activeSessionId: fallback.id
  };
}

function sortSessions(sessions: ExperimentSession[]): ExperimentSession[] {
  return [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function compactSessions(sessions: ExperimentSession[]): ExperimentSession[] {
  const deduped = new Map<string, ExperimentSession>();

  for (const session of sortSessions(sessions)) {
    if (!deduped.has(session.id)) {
      deduped.set(session.id, session);
    }
  }

  const compacted = Array.from(deduped.values()).slice(0, MAX_EXPERIMENT_SESSIONS);

  if (!compacted.some((session) => session.id === DEFAULT_EXPERIMENT_SESSION_ID)) {
    compacted.push(defaultSession());
  }

  return sortSessions(compacted);
}

function normalizeSession(raw: unknown): ExperimentSession | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<ExperimentSession>;

  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: candidate.id,
    name:
      typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name.trim()
        : candidate.id === DEFAULT_EXPERIMENT_SESSION_ID
        ? DEFAULT_EXPERIMENT_SESSION_NAME
        : "Unnamed Session",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now
  };
}

function parseSessions(raw: unknown): ExperimentSession[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normalizeSession).filter((entry): entry is ExperimentSession => Boolean(entry));
}

function migrateStore(raw: unknown): ExperimentSessionsStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const parsed = raw as Partial<ExperimentSessionsStoreV1>;

  if (parsed.version !== EXPERIMENT_SESSIONS_VERSION || !Array.isArray(parsed.sessions)) {
    return emptyStore();
  }

  const sessions = compactSessions(parseSessions(parsed.sessions));
  const activeSessionId =
    typeof parsed.activeSessionId === "string" && sessions.some((session) => session.id === parsed.activeSessionId)
      ? parsed.activeSessionId
      : sessions[0]?.id ?? DEFAULT_EXPERIMENT_SESSION_ID;

  return {
    version: 1,
    sessions,
    activeSessionId
  };
}

function loadStore(): ExperimentSessionsStoreV1 {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  try {
    const raw = localStorage.getItem(EXPERIMENT_SESSIONS_STORAGE_KEY);

    if (!raw) {
      const fallback = emptyStore();
      localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }

    const parsed = JSON.parse(raw) as unknown;
    const migrated = migrateStore(parsed);
    localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const fallback = emptyStore();
    if (typeof window !== "undefined") {
      localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(fallback));
    }
    return fallback;
  }
}

function saveStore(store: ExperimentSessionsStoreV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(store));
}

export function listExperimentSessions(): ExperimentSession[] {
  return sortSessions(loadStore().sessions);
}

export function getActiveExperimentSessionId(): string {
  return loadStore().activeSessionId;
}

export function getActiveExperimentSession(): ExperimentSession | null {
  const store = loadStore();
  return store.sessions.find((session) => session.id === store.activeSessionId) ?? null;
}

export function setActiveExperimentSession(sessionId: string): boolean {
  const store = loadStore();

  if (!store.sessions.some((session) => session.id === sessionId)) {
    return false;
  }

  saveStore({
    ...store,
    activeSessionId: sessionId
  });

  return true;
}

function nextSessionName(name: string, existing: ExperimentSession[]): string {
  const trimmed = name.trim();

  if (trimmed) {
    return trimmed;
  }

  const used = new Set(existing.map((session) => session.name.toLowerCase()));

  for (let i = 1; i <= 999; i += 1) {
    const candidate = `Experiment ${i}`;

    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `Experiment ${Date.now()}`;
}

export function createExperimentSession(name = ""): ExperimentSession {
  const store = loadStore();
  const now = new Date().toISOString();

  const session: ExperimentSession = {
    id: crypto.randomUUID(),
    name: nextSessionName(name, store.sessions),
    createdAt: now,
    updatedAt: now
  };

  const sessions = compactSessions([session, ...store.sessions]);

  saveStore({
    version: 1,
    sessions,
    activeSessionId: session.id
  });

  return session;
}

export function renameExperimentSession(sessionId: string, name: string): ExperimentSession | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return null;
  }

  const store = loadStore();
  let updated: ExperimentSession | null = null;

  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    updated = {
      ...session,
      name: trimmed,
      updatedAt: new Date().toISOString()
    };

    return updated;
  });

  if (!updated) {
    return null;
  }

  saveStore({
    ...store,
    sessions: compactSessions(sessions)
  });

  return updated;
}

export function resetExperimentSessions(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(emptyStore()));
}

