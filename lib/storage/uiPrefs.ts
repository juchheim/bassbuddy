export const UI_PREFS_STORAGE_KEY = "bassbuddy.v1.uiPrefs";
export const UI_PREFS_VERSION = 1;

export interface UiPrefsV1 {
  version: 1;
  setupCompleted: boolean;
  setupCompletedAt?: string;
}

export interface ImportUiPrefsOptions {
  replaceExisting?: boolean;
}

export interface ImportUiPrefsResult {
  updated: boolean;
  setupCompleted: boolean;
  setupCompletedAt?: string;
}

function defaultPrefs(): UiPrefsV1 {
  return {
    version: UI_PREFS_VERSION,
    setupCompleted: false
  };
}

function migratePrefs(raw: unknown): UiPrefsV1 {
  if (!raw || typeof raw !== "object") {
    return defaultPrefs();
  }

  const parsed = raw as Partial<UiPrefsV1>;

  if (parsed.version === 1) {
    return {
      version: 1,
      setupCompleted: Boolean(parsed.setupCompleted),
      setupCompletedAt: typeof parsed.setupCompletedAt === "string" ? parsed.setupCompletedAt : undefined
    };
  }

  return defaultPrefs();
}

function parseImportPayload(payload: unknown): UiPrefsV1 | null {
  const candidate =
    payload && typeof payload === "object" && "uiPrefs" in payload
      ? (payload as { uiPrefs?: unknown }).uiPrefs
      : payload;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return migratePrefs(candidate);
}

export function getUiPrefs(): UiPrefsV1 {
  if (typeof window === "undefined") {
    return defaultPrefs();
  }

  try {
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);

    if (!raw) {
      return defaultPrefs();
    }

    return migratePrefs(JSON.parse(raw) as unknown);
  } catch {
    return defaultPrefs();
  }
}

export function exportUiPrefsPayload(): UiPrefsV1 {
  return getUiPrefs();
}

function saveUiPrefs(prefs: UiPrefsV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

export function importUiPrefsPayload(payload: unknown, options?: ImportUiPrefsOptions): ImportUiPrefsResult {
  const existing = getUiPrefs();
  const incoming = parseImportPayload(payload);

  if (!incoming) {
    return {
      updated: false,
      setupCompleted: existing.setupCompleted,
      setupCompletedAt: existing.setupCompletedAt
    };
  }

  if (options?.replaceExisting) {
    saveUiPrefs(incoming);
    return {
      updated: true,
      setupCompleted: incoming.setupCompleted,
      setupCompletedAt: incoming.setupCompletedAt
    };
  }

  const setupCompleted = existing.setupCompleted || incoming.setupCompleted;
  const setupCompletedAtCandidates = [existing.setupCompletedAt, incoming.setupCompletedAt].filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0
  );
  const setupCompletedAt = setupCompletedAtCandidates
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const merged: UiPrefsV1 = {
    version: UI_PREFS_VERSION,
    setupCompleted,
    setupCompletedAt
  };

  const updated =
    merged.setupCompleted !== existing.setupCompleted || merged.setupCompletedAt !== existing.setupCompletedAt;

  if (updated) {
    saveUiPrefs(merged);
  }

  return {
    updated,
    setupCompleted: merged.setupCompleted,
    setupCompletedAt: merged.setupCompletedAt
  };
}

export function hasCompletedSetup(): boolean {
  return getUiPrefs().setupCompleted;
}

export function markSetupCompleted(completedAt = new Date().toISOString()): UiPrefsV1 {
  const next: UiPrefsV1 = {
    version: UI_PREFS_VERSION,
    setupCompleted: true,
    setupCompletedAt: completedAt
  };

  saveUiPrefs(next);
  return next;
}

export function resetSetupCompleted(): UiPrefsV1 {
  const next = defaultPrefs();
  saveUiPrefs(next);
  return next;
}
