import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";
import { saveDecisionSnapshot, listDecisionSnapshots } from "@/lib/storage/decisionSnapshots";
import { createExperimentSession, listExperimentSessions } from "@/lib/storage/experimentSessions";
import { getGuidedSession, startGuidedSession } from "@/lib/storage/guidedSession";
import { clearRuns, exportRunsPayload, listRuns, saveRun } from "@/lib/storage/runsStore";
import {
  exportSessionBundle,
  importSessionBundlePayload,
  SESSION_BUNDLE_TYPE,
  SESSION_BUNDLE_VERSION
} from "@/lib/storage/sessionBundle";
import { getUiPrefs, markSetupCompleted, resetSetupCompleted } from "@/lib/storage/uiPrefs";
import { getWinnerLock, listWinnerLockHistory, saveWinnerLock } from "@/lib/storage/winnerLock";
import type { DecisionReport } from "@/lib/utils/decisionAssistant";
import type { BassRun } from "@/lib/types";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  length = 0;

  clear(): void {
    this.data.clear();
    this.length = 0;
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
    this.length = this.data.size;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
    this.length = this.data.size;
  }
}

const baseReport: DecisionReport = {
  generatedAt: "2026-02-01T00:00:00.000Z",
  overallConfidence: "medium",
  overallScore: 60,
  summary: "test",
  nextActions: ["run"],
  placement: {
    available: true,
    winner: "Placement A",
    confidence: "medium",
    confidenceScore: 60,
    rationale: "test",
    blockers: [],
    warnings: [],
    nextActions: [],
    evidence: []
  },
  phase: {
    available: true,
    winner: "Phase 0",
    confidence: "medium",
    confidenceScore: 60,
    rationale: "test",
    blockers: [],
    warnings: [],
    nextActions: [],
    evidence: []
  },
  scout: {
    candidateCount: 0,
    topTwo: []
  }
};

function makeRun(id: string, mode: BassRun["mode"], sessionId: string, label: string): BassRun {
  return {
    id,
    createdAt: "2026-02-01T10:00:00.000Z",
    mode,
    label,
    sessionId,
    deviceInfo: { userAgent: "test", platform: "test" },
    micSettings: {
      requested: {},
      supported: {},
      settings: {},
      capabilities: {},
      processingRisk: "low",
      warnings: []
    },
    sampleRate: 48_000,
    beepDetected: true,
    confidence: "high",
    measurements: [
      { freqHz: 25, levelRaw: -30, levelRelDb: 0 },
      { freqHz: 40, levelRaw: -30, levelRelDb: 1 }
    ],
    score: 20,
    highlights: {
      worstPeakHz: 40,
      worstDipHz: 25,
      maxPeakDb: 1,
      maxDipDb: -1,
      deepDipCount: 0,
      bigPeakCount: 0
    },
    quality: {
      score: 90,
      tier: "excellent",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -20,
    volumeAnchorDb: -30
  };
}

describe("session bundle storage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: new MemoryStorage() },
      configurable: true
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: (globalThis.window as { localStorage: Storage }).localStorage,
      configurable: true
    });
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it("exports a full bundle with sessions, runs, snapshots, guided state, and prefs", () => {
    const session = createExperimentSession("Movie Night");
    saveRun(makeRun("run-1", "ab", session.id, "Placement A"));
    saveDecisionSnapshot(baseReport, 1, "checkpoint", session.id);
    saveWinnerLock({ sessionId: session.id, placementWinner: "Placement A", source: "decision" });
    saveWinnerLock({ sessionId: session.id, phaseWinner: "Phase 180", source: "decision" });
    startGuidedSession("ab", 2);
    markSetupCompleted("2026-02-01T10:05:00.000Z");

    const bundle = exportSessionBundle();

    expect(bundle.type).toBe(SESSION_BUNDLE_TYPE);
    expect(bundle.version).toBe(SESSION_BUNDLE_VERSION);
    expect(bundle.runs.runs).toHaveLength(1);
    expect(bundle.experimentSessions.sessions.some((entry) => entry.id === session.id)).toBe(true);
    expect(bundle.decisionSnapshots.snapshots).toHaveLength(1);
    expect(bundle.winnerLocks.locks).toHaveLength(1);
    expect(bundle.winnerLocks.history).toHaveLength(2);
    expect(bundle.guidedSession?.mode).toBe("ab");
    expect(bundle.uiPrefs.setupCompleted).toBe(true);
  });

  it("imports full bundles in merge mode", () => {
    saveRun(makeRun("existing-run", "baseline", DEFAULT_EXPERIMENT_SESSION_ID, "Baseline"));
    resetSetupCompleted();

    const bundle = {
      type: SESSION_BUNDLE_TYPE,
      version: SESSION_BUNDLE_VERSION,
      exportedAt: "2026-02-01T12:00:00.000Z",
      app: "SubSpot (MVP)" as const,
      experimentSessions: {
        version: 1 as const,
        activeSessionId: "session-import",
        sessions: [
          {
            id: DEFAULT_EXPERIMENT_SESSION_ID,
            name: "Default Session",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z"
          },
          {
            id: "session-import",
            name: "Imported Session",
            createdAt: "2026-02-01T01:00:00.000Z",
            updatedAt: "2026-02-01T02:00:00.000Z"
          }
        ]
      },
      runs: {
        version: 1 as const,
        exportedAt: "2026-02-01T12:00:00.000Z",
        runs: [makeRun("import-run", "ab", "session-import", "Placement B")]
      },
      decisionSnapshots: {
        version: 1 as const,
        snapshots: [
          {
            id: "snapshot-import",
            createdAt: "2026-02-01T12:00:00.000Z",
            label: "Imported snapshot",
            sessionId: "session-import",
            runCount: 1,
            report: baseReport
          }
        ]
      },
      winnerLocks: {
        version: 1 as const,
        locks: [
          {
            sessionId: "session-import",
            placementWinner: "Placement B",
            phaseWinner: "Phase 180",
            notes: "Imported lock",
            source: "decision" as const,
            createdAt: "2026-02-01T12:00:00.000Z",
            updatedAt: "2026-02-01T12:00:00.000Z"
          }
        ],
        history: [
          {
            id: "lock-history-1",
            sessionId: "session-import",
            placementWinner: "Placement B",
            phaseWinner: "Phase 180",
            notes: "Imported lock",
            source: "decision" as const,
            createdAt: "2026-02-01T12:00:00.000Z"
          }
        ]
      },
      guidedSession: {
        version: 1 as const,
        id: "guided-import",
        mode: "ab" as const,
        repeatsPerSide: 2,
        createdAt: "2026-02-01T11:00:00.000Z",
        updatedAt: "2026-02-01T11:05:00.000Z",
        currentStepIndex: 1,
        steps: [
          { stepIndex: 0, side: "A" as const, repeatIndex: 1, repeatsPerSide: 2, label: "Placement A" },
          { stepIndex: 1, side: "A" as const, repeatIndex: 2, repeatsPerSide: 2, label: "Placement A" }
        ],
        runIds: []
      },
      uiPrefs: {
        version: 1 as const,
        setupCompleted: true,
        setupCompletedAt: "2026-02-01T12:01:00.000Z"
      }
    };

    const result = importSessionBundlePayload(bundle, { replaceExisting: false });

    expect(result.format).toBe("bundle");
    expect(result.runs.added).toBe(1);
    expect(listRuns()).toHaveLength(2);
    expect(listExperimentSessions().some((entry) => entry.id === "session-import")).toBe(true);
    expect(listDecisionSnapshots("session-import")).toHaveLength(1);
    expect(getWinnerLock("session-import")?.placementWinner).toBe("Placement B");
    expect(listWinnerLockHistory("session-import")).toHaveLength(1);
    expect(getGuidedSession()?.id).toBe("guided-import");
    expect(getUiPrefs().setupCompleted).toBe(true);
  });

  it("imports full bundles in replace mode and clears omitted sections", () => {
    const session = createExperimentSession("Before Replace");
    saveRun(makeRun("run-before", "ab", session.id, "Placement A"));
    saveDecisionSnapshot(baseReport, 1, "before", session.id);
    saveWinnerLock({ sessionId: session.id, placementWinner: "Placement A", source: "compare" });
    startGuidedSession("ab", 2);
    markSetupCompleted("2026-02-01T10:05:00.000Z");

    const replacementBundle = {
      type: SESSION_BUNDLE_TYPE,
      version: SESSION_BUNDLE_VERSION,
      exportedAt: "2026-02-01T12:00:00.000Z",
      app: "SubSpot (MVP)" as const,
      experimentSessions: {
        version: 1 as const,
        activeSessionId: "session-new",
        sessions: [
          {
            id: DEFAULT_EXPERIMENT_SESSION_ID,
            name: "Default Session",
            createdAt: "2026-02-01T00:00:00.000Z",
            updatedAt: "2026-02-01T00:00:00.000Z"
          },
          {
            id: "session-new",
            name: "New Session",
            createdAt: "2026-02-01T01:00:00.000Z",
            updatedAt: "2026-02-01T02:00:00.000Z"
          }
        ]
      },
      runs: {
        version: 1 as const,
        exportedAt: "2026-02-01T12:00:00.000Z",
        runs: []
      },
      decisionSnapshots: {
        version: 1 as const,
        snapshots: []
      },
      winnerLocks: {
        version: 1 as const,
        locks: [],
        history: []
      },
      guidedSession: null,
      uiPrefs: {
        version: 1 as const,
        setupCompleted: false
      }
    };

    const result = importSessionBundlePayload(replacementBundle, { replaceExisting: true });

    expect(result.format).toBe("bundle");
    expect(result.runs.total).toBe(0);
    expect(listRuns()).toHaveLength(0);
    expect(listDecisionSnapshots()).toHaveLength(0);
    expect(getWinnerLock(session.id)).toBeNull();
    expect(getGuidedSession()).toBeNull();
    expect(getUiPrefs().setupCompleted).toBe(false);
    expect(listExperimentSessions().some((entry) => entry.id === "session-new")).toBe(true);
  });

  it("supports legacy runs-only imports", () => {
    clearRuns();
    const legacyRunsPayload = {
      ...exportRunsPayload(),
      runs: [makeRun("legacy-run", "phase", DEFAULT_EXPERIMENT_SESSION_ID, "Phase 0")]
    };

    const result = importSessionBundlePayload(legacyRunsPayload);

    expect(result.format).toBe("runs-legacy");
    expect(result.runs.total).toBe(1);
    expect(listRuns()).toHaveLength(1);
  });
});
