export const UI_PREFS_STORAGE_KEY = "bassbuddy.v1.uiPrefs";
export const UI_PREFS_VERSION = 1;

export interface UiPrefsV1 {
  version: 1;
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

function saveUiPrefs(prefs: UiPrefsV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
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
