import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";
import type { BassRun } from "@/lib/types";
import { clearRuns, listRuns, saveRun } from "@/lib/storage/runsStore";

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

function makeRun(id: string, mode: BassRun["mode"], sessionId?: string): BassRun {
  return {
    id,
    createdAt: new Date(Date.now() + Number(id.replace(/\D/g, "") || 0) * 1000).toISOString(),
    mode,
    label: mode === "phase" ? "Phase 0" : "Placement A",
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
      { freqHz: 40, levelRaw: -30, levelRelDb: 0 }
    ],
    score: 10,
    highlights: {
      worstPeakHz: 40,
      worstDipHz: 25,
      maxPeakDb: 0,
      maxDipDb: 0,
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
    beepToneLevelDb: -24,
    volumeAnchorDb: -30
  };
}

describe("runsStore session filtering", () => {
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

  it("assigns default session for runs without session id", () => {
    saveRun(makeRun("1", "ab"));

    const runs = listRuns();
    expect(runs[0]?.sessionId).toBe(DEFAULT_EXPERIMENT_SESSION_ID);
  });

  it("filters list/clear by session id", () => {
    saveRun(makeRun("1", "ab", "session-a"));
    saveRun(makeRun("2", "ab", "session-b"));
    saveRun(makeRun("3", "phase", "session-a"));

    expect(listRuns("ab", "session-a")).toHaveLength(1);
    expect(listRuns("ab", "session-b")).toHaveLength(1);

    const removed = clearRuns("ab", "session-a");
    expect(removed).toBe(1);
    expect(listRuns("ab", "session-a")).toHaveLength(0);
    expect(listRuns("ab", "session-b")).toHaveLength(1);
  });
});

