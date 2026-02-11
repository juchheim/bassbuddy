import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createExperimentSession,
  getActiveExperimentSession,
  getActiveExperimentSessionId,
  listExperimentSessions,
  renameExperimentSession,
  resetExperimentSessions,
  setActiveExperimentSession
} from "@/lib/storage/experimentSessions";
import { DEFAULT_EXPERIMENT_SESSION_ID } from "@/lib/constants/sessions";

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

describe("experimentSessions storage", () => {
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

  it("initializes with default session", () => {
    const sessions = listExperimentSessions();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.some((entry) => entry.id === DEFAULT_EXPERIMENT_SESSION_ID)).toBe(true);
    expect(getActiveExperimentSessionId()).toBeTruthy();
  });

  it("creates, activates, and renames sessions", () => {
    const created = createExperimentSession("Corner Test");

    expect(getActiveExperimentSessionId()).toBe(created.id);
    expect(listExperimentSessions().some((entry) => entry.id === created.id)).toBe(true);

    const renamed = renameExperimentSession(created.id, "Corner Test Rev2");
    expect(renamed?.name).toBe("Corner Test Rev2");

    const switched = setActiveExperimentSession(DEFAULT_EXPERIMENT_SESSION_ID);
    expect(switched).toBe(true);
    expect(getActiveExperimentSession()?.id).toBe(DEFAULT_EXPERIMENT_SESSION_ID);
  });

  it("resets to default session state", () => {
    createExperimentSession("One");
    createExperimentSession("Two");
    resetExperimentSessions();

    const sessions = listExperimentSessions();
    expect(sessions.some((entry) => entry.id === DEFAULT_EXPERIMENT_SESSION_ID)).toBe(true);
    expect(getActiveExperimentSessionId()).toBe(DEFAULT_EXPERIMENT_SESSION_ID);
  });
});

