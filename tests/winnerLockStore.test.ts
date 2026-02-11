import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";
import {
  clearWinnerLocks,
  exportWinnerLocksPayload,
  getWinnerLock,
  importWinnerLocksPayload,
  listWinnerLockHistory,
  listWinnerLocks,
  saveWinnerLock
} from "@/lib/storage/winnerLock";

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

describe("winner lock storage", () => {
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

  it("saves and merges placement/phase locks per session", () => {
    const first = saveWinnerLock({
      sessionId: "session-a",
      placementWinner: "Placement B",
      notes: "From compare",
      source: "compare"
    });
    expect(first?.placementWinner).toBe("Placement B");
    expect(first?.phaseWinner).toBeUndefined();

    const second = saveWinnerLock({
      sessionId: "session-a",
      phaseWinner: "Phase 180",
      source: "decision"
    });
    expect(second?.placementWinner).toBe("Placement B");
    expect(second?.phaseWinner).toBe("Phase 180");
    expect(second?.notes).toBe("From compare");
    expect(getWinnerLock("session-a")?.phaseWinner).toBe("Phase 180");
    const history = listWinnerLockHistory("session-a");
    expect(history).toHaveLength(2);
    expect(history[0]?.phaseWinner).toBe("Phase 180");
    expect(history[1]?.placementWinner).toBe("Placement B");
  });

  it("clears session-specific and global locks", () => {
    saveWinnerLock({ sessionId: "session-a", placementWinner: "Placement A", source: "compare" });
    saveWinnerLock({ sessionId: "session-b", phaseWinner: "Phase 0", source: "decision" });
    saveWinnerLock({ placementWinner: "Default placement", source: "decision" });

    expect(listWinnerLocks()).toHaveLength(3);
    const removedSession = clearWinnerLocks("session-a");
    expect(removedSession).toBe(1);
    expect(getWinnerLock("session-a")).toBeNull();
    expect(listWinnerLockHistory("session-a")).toHaveLength(0);
    expect(getWinnerLock(DEFAULT_EXPERIMENT_SESSION_ID)).not.toBeNull();

    const removedAll = clearWinnerLocks();
    expect(removedAll).toBe(2);
    expect(listWinnerLocks()).toHaveLength(0);
  });

  it("exports and imports locks with merge/replace", () => {
    saveWinnerLock({ sessionId: "session-a", placementWinner: "Placement A", source: "compare" });
    saveWinnerLock({ sessionId: "session-a", phaseWinner: "Phase 180", source: "decision" });
    const exported = exportWinnerLocksPayload();
    expect(exported.history).toHaveLength(2);

    saveWinnerLock({ sessionId: "session-b", phaseWinner: "Phase 0", source: "decision" });

    const merged = importWinnerLocksPayload(exported);
    expect(merged.added).toBe(0);
    expect(merged.replaced).toBe(1);
    expect(listWinnerLocks()).toHaveLength(2);

    const replaced = importWinnerLocksPayload(exported, { replaceExisting: true });
    expect(replaced.total).toBe(1);
    expect(listWinnerLocks()).toHaveLength(1);
    expect(getWinnerLock("session-a")?.placementWinner).toBe("Placement A");
    expect(listWinnerLockHistory("session-a")).toHaveLength(2);
  });

  it("can clear current locks while keeping history when requested", () => {
    saveWinnerLock({ sessionId: "session-a", placementWinner: "Placement A", source: "compare" });
    saveWinnerLock({ sessionId: "session-a", phaseWinner: "Phase 0", source: "decision" });

    const removed = clearWinnerLocks("session-a", { includeHistory: false });
    expect(removed).toBe(1);
    expect(getWinnerLock("session-a")).toBeNull();
    expect(listWinnerLockHistory("session-a")).toHaveLength(2);
  });
});
