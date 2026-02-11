import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDecisionSnapshots,
  deleteDecisionSnapshot,
  listDecisionSnapshots,
  saveDecisionSnapshot
} from "@/lib/storage/decisionSnapshots";
import type { DecisionReport } from "@/lib/utils/decisionAssistant";

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
  generatedAt: new Date().toISOString(),
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
    winner: "Phase 0°",
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

describe("decisionSnapshots storage", () => {
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

  it("saves and lists snapshots", () => {
    saveDecisionSnapshot(baseReport, 5, "first", "session-a");
    const second = saveDecisionSnapshot({ ...baseReport, overallScore: 65 }, 6, "second", "session-a");

    const snapshots = listDecisionSnapshots("session-a");
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.id).toBe(second.id);
    expect(snapshots[0]?.label).toBe("second");
    expect(snapshots[0]?.sessionId).toBe("session-a");
  });

  it("deletes and clears snapshots by session", () => {
    const one = saveDecisionSnapshot(baseReport, 2, "one", "session-a");
    saveDecisionSnapshot(baseReport, 3, "two", "session-a");
    saveDecisionSnapshot(baseReport, 3, "other", "session-b");

    const deleted = deleteDecisionSnapshot(one.id);
    expect(deleted).toBe(true);
    expect(listDecisionSnapshots("session-a")).toHaveLength(1);
    expect(listDecisionSnapshots("session-b")).toHaveLength(1);

    const removed = clearDecisionSnapshots("session-a");
    expect(removed).toBe(1);
    expect(listDecisionSnapshots("session-a")).toHaveLength(0);
    expect(listDecisionSnapshots("session-b")).toHaveLength(1);
  });
});
