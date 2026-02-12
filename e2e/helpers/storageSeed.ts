import type { Page } from "@playwright/test";

export const LIVING_SESSION_ID = "session-living";

const RUNS_STORAGE_KEY = "subspot.v1.runs";
const SESSIONS_STORAGE_KEY = "subspot.v1.experimentSessions";
const UI_PREFS_STORAGE_KEY = "subspot.v1.uiPrefs";
const DECISION_SNAPSHOTS_STORAGE_KEY = "subspot.v1.decisionSnapshots";
const GUIDED_SESSION_KEY = "subspot.v1.guidedSession";

const TEST_FREQS = [25, 31.5, 40, 50, 63, 80, 100, 125];

interface SeedRunInput {
  id: string;
  createdAt: string;
  mode: "ab" | "phase";
  label: string;
  score: number;
  curve: number[];
  worstPeakHz: number;
  worstDipHz: number;
  maxPeakDb: number;
  maxDipDb: number;
  deepDipCount: number;
  bigPeakCount: number;
}

function makeMeasurements(curve: number[]) {
  return TEST_FREQS.map((freqHz, index) => {
    const rel = curve[index] ?? 0;
    return {
      freqHz,
      levelRaw: -30 + rel,
      levelRelDb: rel
    };
  });
}

function makeRun(input: SeedRunInput) {
  return {
    id: input.id,
    createdAt: input.createdAt,
    mode: input.mode,
    label: input.label,
    sessionId: LIVING_SESSION_ID,
    deviceInfo: {
      userAgent: "playwright",
      platform: "test"
    },
    micSettings: {
      requested: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      supported: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      settings: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      },
      capabilities: {},
      processingRisk: "low",
      warnings: []
    },
    sampleRate: 48_000,
    beepDetected: true,
    confidence: "high",
    measurements: makeMeasurements(input.curve),
    score: input.score,
    highlights: {
      worstPeakHz: input.worstPeakHz,
      worstDipHz: input.worstDipHz,
      maxPeakDb: input.maxPeakDb,
      maxDipDb: input.maxDipDb,
      deepDipCount: input.deepDipCount,
      bigPeakCount: input.bigPeakCount
    },
    quality: {
      score: 92,
      tier: "excellent",
      blocking: false,
      issues: []
    },
    medianRawLevelDb: -30,
    beepToneLevelDb: -20,
    volumeAnchorDb: -30
  };
}

export function buildPrimarySeed() {
  const runs = [
    makeRun({
      id: "ab-a",
      createdAt: "2026-02-01T10:00:00.000Z",
      mode: "ab",
      label: "Placement A",
      score: 42,
      curve: [2, 3, 5, 6, 2, -1, -4, -6],
      worstPeakHz: 50,
      worstDipHz: 125,
      maxPeakDb: 6.1,
      maxDipDb: -6.2,
      deepDipCount: 1,
      bigPeakCount: 1
    }),
    makeRun({
      id: "ab-b",
      createdAt: "2026-02-01T10:05:00.000Z",
      mode: "ab",
      label: "Placement B",
      score: 18,
      curve: [1, 1.5, 2, 2.5, 1, -0.5, -1, -2],
      worstPeakHz: 50,
      worstDipHz: 125,
      maxPeakDb: 2.5,
      maxDipDb: -2.1,
      deepDipCount: 0,
      bigPeakCount: 0
    }),
    makeRun({
      id: "phase-0",
      createdAt: "2026-02-01T11:00:00.000Z",
      mode: "phase",
      label: "Phase 0",
      score: 34,
      curve: [1, 2, 3, 4, 2, 0, -2, -3],
      worstPeakHz: 50,
      worstDipHz: 125,
      maxPeakDb: 4.0,
      maxDipDb: -3.0,
      deepDipCount: 0,
      bigPeakCount: 0
    }),
    makeRun({
      id: "phase-180",
      createdAt: "2026-02-01T11:05:00.000Z",
      mode: "phase",
      label: "Phase 180",
      score: 19,
      curve: [0.5, 1, 1.5, 2, 1, 0, -1, -1.5],
      worstPeakHz: 50,
      worstDipHz: 125,
      maxPeakDb: 2.0,
      maxDipDb: -1.6,
      deepDipCount: 0,
      bigPeakCount: 0
    })
  ];

  return {
    [RUNS_STORAGE_KEY]: {
      version: 1,
      runs
    },
    [SESSIONS_STORAGE_KEY]: {
      version: 1,
      sessions: [
        {
          id: "session-default",
          name: "Default Session",
          createdAt: "2026-02-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z"
        },
        {
          id: LIVING_SESSION_ID,
          name: "Living Room Test",
          createdAt: "2026-02-01T00:10:00.000Z",
          updatedAt: "2026-02-01T12:00:00.000Z"
        }
      ],
      activeSessionId: LIVING_SESSION_ID
    },
    [UI_PREFS_STORAGE_KEY]: {
      version: 1,
      setupCompleted: true,
      setupCompletedAt: "2026-02-01T00:10:00.000Z"
    },
    [DECISION_SNAPSHOTS_STORAGE_KEY]: {
      version: 1,
      snapshots: []
    }
  } as Record<string, unknown>;
}

export async function applySeed(page: Page, payload = buildPrimarySeed()): Promise<void> {
  await page.goto("/");
  await page.evaluate(
    ({ nextPayload, guidedSessionKey }) => {
      localStorage.clear();
      localStorage.removeItem(guidedSessionKey);

      for (const [key, value] of Object.entries(nextPayload)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    },
    { nextPayload: payload, guidedSessionKey: GUIDED_SESSION_KEY }
  );
  await page.reload();
}
