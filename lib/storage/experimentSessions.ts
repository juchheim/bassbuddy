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
  archivedAt?: string;
}

interface ListExperimentSessionsOptions {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}

export interface ArchiveSessionResult {
  archivedSession: ExperimentSession;
  nextActiveSessionId: string;
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
  return [...sessions].sort((a, b) => {
    const aArchived = Boolean(a.archivedAt);
    const bArchived = Boolean(b.archivedAt);

    if (aArchived !== bArchived) {
      return aArchived ? 1 : -1;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function normalizeDefaultSession(session: ExperimentSession): ExperimentSession {
  if (session.id !== DEFAULT_EXPERIMENT_SESSION_ID) {
    return session;
  }

  return {
    ...session,
    name: DEFAULT_EXPERIMENT_SESSION_NAME,
    archivedAt: undefined
  };
}

function visibleSessions(sessions: ExperimentSession[]): ExperimentSession[] {
  return sessions.filter((session) => !session.archivedAt);
}

function compactSessions(sessions: ExperimentSession[]): ExperimentSession[] {
  const deduped = new Map<string, ExperimentSession>();

  for (const session of sortSessions(sessions)) {
    if (!deduped.has(session.id)) {
      deduped.set(session.id, session);
    }
  }

  const dedupedList = Array.from(deduped.values());
  let compacted = dedupedList.slice(0, MAX_EXPERIMENT_SESSIONS);

  if (!compacted.some((session) => session.id === DEFAULT_EXPERIMENT_SESSION_ID)) {
    const existingDefault = dedupedList.find((session) => session.id === DEFAULT_EXPERIMENT_SESSION_ID);
    compacted = [existingDefault ?? defaultSession(), ...compacted].slice(0, MAX_EXPERIMENT_SESSIONS);
  }

  const normalized = compacted.map(normalizeDefaultSession);

  return sortSessions(normalized);
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
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
    archivedAt: typeof candidate.archivedAt === "string" && candidate.archivedAt.trim() ? candidate.archivedAt : undefined
  };
}

function parseSessions(raw: unknown): ExperimentSession[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normalizeSession).filter((entry): entry is ExperimentSession => Boolean(entry));
}

function resolveActiveSessionId(store: ExperimentSessionsStoreV1): string {
  const visible = visibleSessions(store.sessions);
  const activeVisible = visible.find((session) => session.id === store.activeSessionId);

  if (activeVisible) {
    return activeVisible.id;
  }

  return visible[0]?.id ?? DEFAULT_EXPERIMENT_SESSION_ID;
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
  const candidateActive =
    typeof parsed.activeSessionId === "string" && sessions.some((session) => session.id === parsed.activeSessionId)
      ? parsed.activeSessionId
      : sessions[0]?.id ?? DEFAULT_EXPERIMENT_SESSION_ID;

  const activeSessionId = resolveActiveSessionId({
    version: 1,
    sessions,
    activeSessionId: candidateActive
  });

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

export function listExperimentSessions(options?: ListExperimentSessionsOptions): ExperimentSession[] {
  const sessions = sortSessions(loadStore().sessions);

  if (options?.archivedOnly) {
    return sessions.filter((session) => Boolean(session.archivedAt));
  }

  if (options?.includeArchived) {
    return sessions;
  }

  return sessions.filter((session) => !session.archivedAt);
}

export function getExperimentSessionById(sessionId: string): ExperimentSession | null {
  return loadStore().sessions.find((session) => session.id === sessionId) ?? null;
}

export function getActiveExperimentSessionId(): string {
  const store = loadStore();
  const resolvedActiveSessionId = resolveActiveSessionId(store);

  if (resolvedActiveSessionId !== store.activeSessionId) {
    saveStore({
      ...store,
      activeSessionId: resolvedActiveSessionId
    });
  }

  return resolvedActiveSessionId;
}

export function getActiveExperimentSession(): ExperimentSession | null {
  const store = loadStore();
  const activeSessionId = resolveActiveSessionId(store);

  if (activeSessionId !== store.activeSessionId) {
    saveStore({
      ...store,
      activeSessionId
    });
  }

  return store.sessions.find((session) => session.id === activeSessionId && !session.archivedAt) ?? null;
}

export function setActiveExperimentSession(sessionId: string): boolean {
  const store = loadStore();

  if (!store.sessions.some((session) => session.id === sessionId && !session.archivedAt)) {
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

export function archiveExperimentSession(sessionId: string): ArchiveSessionResult | null {
  if (sessionId === DEFAULT_EXPERIMENT_SESSION_ID) {
    return null;
  }

  const store = loadStore();
  const now = new Date().toISOString();
  let archivedSession: ExperimentSession | null = null;

  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId || session.archivedAt) {
      return session;
    }

    archivedSession = {
      ...session,
      archivedAt: now,
      updatedAt: now
    };

    return archivedSession;
  });

  if (!archivedSession) {
    return null;
  }

  const compactedSessions = compactSessions(sessions);
  const nextActiveSessionId = resolveActiveSessionId({
    version: 1,
    sessions: compactedSessions,
    activeSessionId: store.activeSessionId
  });

  saveStore({
    version: 1,
    sessions: compactedSessions,
    activeSessionId: nextActiveSessionId
  });

  return {
    archivedSession,
    nextActiveSessionId
  };
}

export function restoreExperimentSession(sessionId: string): ExperimentSession | null {
  const store = loadStore();
  const now = new Date().toISOString();
  let restoredSession: ExperimentSession | null = null;

  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId || !session.archivedAt) {
      return session;
    }

    restoredSession = {
      ...session,
      archivedAt: undefined,
      updatedAt: now
    };

    return restoredSession;
  });

  if (!restoredSession) {
    return null;
  }

  const compactedSessions = compactSessions(sessions);

  saveStore({
    ...store,
    sessions: compactedSessions
  });

  return restoredSession;
}

export function resetExperimentSessions(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(EXPERIMENT_SESSIONS_STORAGE_KEY, JSON.stringify(emptyStore()));
}
