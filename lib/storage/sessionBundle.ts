import {
  exportDecisionSnapshotsPayload,
  importDecisionSnapshotsPayload,
  type ImportDecisionSnapshotsResult
} from "@/lib/storage/decisionSnapshots";
import {
  exportExperimentSessionsPayload,
  importExperimentSessionsPayload,
  type ImportExperimentSessionsResult
} from "@/lib/storage/experimentSessions";
import {
  exportGuidedSessionPayload,
  importGuidedSessionPayload,
  type ImportGuidedSessionResult
} from "@/lib/storage/guidedSession";
import { exportRunsPayload, importRunsPayload, type ImportRunsResult } from "@/lib/storage/runsStore";
import { exportUiPrefsPayload, importUiPrefsPayload, type ImportUiPrefsResult } from "@/lib/storage/uiPrefs";
import {
  exportWinnerLocksPayload,
  importWinnerLocksPayload,
  type ImportWinnerLocksResult
} from "@/lib/storage/winnerLock";

export const SESSION_BUNDLE_TYPE = "bassbuddy.session-bundle.v1";
export const SESSION_BUNDLE_VERSION = 1;

export interface SessionBundleV1 {
  type: typeof SESSION_BUNDLE_TYPE;
  version: typeof SESSION_BUNDLE_VERSION;
  exportedAt: string;
  app: "BassBuddy (MVP)";
  experimentSessions: ReturnType<typeof exportExperimentSessionsPayload>;
  runs: ReturnType<typeof exportRunsPayload>;
  decisionSnapshots: ReturnType<typeof exportDecisionSnapshotsPayload>;
  winnerLocks: ReturnType<typeof exportWinnerLocksPayload>;
  guidedSession: ReturnType<typeof exportGuidedSessionPayload>;
  uiPrefs: ReturnType<typeof exportUiPrefsPayload>;
}

export interface ImportSessionBundleOptions {
  replaceExisting?: boolean;
}

export interface ImportSessionBundleResult {
  format: "bundle" | "runs-legacy";
  replacedAll: boolean;
  sessions: ImportExperimentSessionsResult;
  runs: ImportRunsResult;
  decisionSnapshots: ImportDecisionSnapshotsResult;
  winnerLocks: ImportWinnerLocksResult;
  guidedSession: ImportGuidedSessionResult;
  uiPrefs: ImportUiPrefsResult;
}

const EMPTY_SESSION_RESULT: ImportExperimentSessionsResult = {
  added: 0,
  replaced: 0,
  total: 0,
  activeSessionId: ""
};

const EMPTY_RUNS_RESULT: ImportRunsResult = {
  added: 0,
  replaced: 0,
  total: 0
};

const EMPTY_SNAPSHOTS_RESULT: ImportDecisionSnapshotsResult = {
  added: 0,
  replaced: 0,
  total: 0
};

const EMPTY_GUIDED_RESULT: ImportGuidedSessionResult = {
  imported: false,
  replaced: false,
  cleared: false,
  active: false
};

const EMPTY_WINNER_LOCK_RESULT: ImportWinnerLocksResult = {
  added: 0,
  replaced: 0,
  total: 0
};

const EMPTY_PREFS_RESULT: ImportUiPrefsResult = {
  updated: false,
  setupCompleted: false
};

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function isBundlePayload(payload: unknown): payload is SessionBundleV1 {
  const record = asRecord(payload);

  if (!record) {
    return false;
  }

  if (record.type === SESSION_BUNDLE_TYPE && record.version === SESSION_BUNDLE_VERSION) {
    return true;
  }

  return "experimentSessions" in record && "runs" in record;
}

export function exportSessionBundle(): SessionBundleV1 {
  return {
    type: SESSION_BUNDLE_TYPE,
    version: SESSION_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    app: "BassBuddy (MVP)",
    experimentSessions: exportExperimentSessionsPayload(),
    runs: exportRunsPayload(),
    decisionSnapshots: exportDecisionSnapshotsPayload(),
    winnerLocks: exportWinnerLocksPayload(),
    guidedSession: exportGuidedSessionPayload(),
    uiPrefs: exportUiPrefsPayload()
  };
}

export function importSessionBundlePayload(
  payload: unknown,
  options?: ImportSessionBundleOptions
): ImportSessionBundleResult {
  if (!isBundlePayload(payload)) {
    const runs = importRunsPayload(payload, { replaceExisting: options?.replaceExisting });

    return {
      format: "runs-legacy",
      replacedAll: Boolean(options?.replaceExisting),
      sessions: EMPTY_SESSION_RESULT,
      runs,
      decisionSnapshots: EMPTY_SNAPSHOTS_RESULT,
      winnerLocks: EMPTY_WINNER_LOCK_RESULT,
      guidedSession: EMPTY_GUIDED_RESULT,
      uiPrefs: EMPTY_PREFS_RESULT
    };
  }

  const record = asRecord(payload);

  if (!record) {
    return {
      format: "runs-legacy",
      replacedAll: Boolean(options?.replaceExisting),
      sessions: EMPTY_SESSION_RESULT,
      runs: EMPTY_RUNS_RESULT,
      decisionSnapshots: EMPTY_SNAPSHOTS_RESULT,
      winnerLocks: EMPTY_WINNER_LOCK_RESULT,
      guidedSession: EMPTY_GUIDED_RESULT,
      uiPrefs: EMPTY_PREFS_RESULT
    };
  }

  const sessionsPayload = "experimentSessions" in record ? record.experimentSessions : record.sessions;
  const runsPayload = "runs" in record ? record.runs : [];
  const snapshotsPayload =
    "decisionSnapshots" in record ? record.decisionSnapshots : "snapshots" in record ? record.snapshots : [];
  const winnerLocksPayload =
    "winnerLocks" in record ? record.winnerLocks : "locks" in record ? record.locks : [];
  const guidedPayload =
    "guidedSession" in record ? record.guidedSession : "guided" in record ? record.guided : null;
  const uiPrefsPayload = "uiPrefs" in record ? record.uiPrefs : null;

  const importOptions = { replaceExisting: Boolean(options?.replaceExisting) };

  const sessions = importExperimentSessionsPayload(sessionsPayload, importOptions);
  const runs = importRunsPayload(runsPayload, importOptions);
  const decisionSnapshots = importDecisionSnapshotsPayload(snapshotsPayload, importOptions);
  const winnerLocks = importWinnerLocksPayload(winnerLocksPayload, importOptions);
  const guidedSession = importGuidedSessionPayload(guidedPayload, importOptions);
  const uiPrefs = importUiPrefsPayload(uiPrefsPayload, importOptions);

  return {
    format: "bundle",
    replacedAll: Boolean(options?.replaceExisting),
    sessions,
    runs,
    decisionSnapshots,
    winnerLocks,
    guidedSession,
    uiPrefs
  };
}

export function importSessionBundleJson(
  jsonText: string,
  options?: ImportSessionBundleOptions
): ImportSessionBundleResult {
  const payload = JSON.parse(jsonText) as unknown;
  return importSessionBundlePayload(payload, options);
}
