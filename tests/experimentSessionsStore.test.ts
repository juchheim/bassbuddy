import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  archiveExperimentSession,
  createExperimentSession,
  getActiveExperimentSession,
  getActiveExperimentSessionId,
  listExperimentSessions,
  restoreExperimentSession,
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

  it("archives sessions and keeps them out of active selectors", () => {
    const first = createExperimentSession("Living Room");
    const second = createExperimentSession("Family Room");

    expect(getActiveExperimentSessionId()).toBe(second.id);

    const archived = archiveExperimentSession(second.id);
    expect(archived?.archivedSession.id).toBe(second.id);
    expect(archived?.nextActiveSessionId).not.toBe(second.id);
    expect(getActiveExperimentSessionId()).toBe(archived?.nextActiveSessionId);

    const visibleSessions = listExperimentSessions();
    const archivedSessions = listExperimentSessions({ archivedOnly: true });

    expect(visibleSessions.some((entry) => entry.id === second.id)).toBe(false);
    expect(archivedSessions.some((entry) => entry.id === second.id)).toBe(true);
    expect(setActiveExperimentSession(second.id)).toBe(false);
    expect(visibleSessions.some((entry) => entry.id === first.id)).toBe(true);
  });

  it("restores archived sessions and allows activation", () => {
    const created = createExperimentSession("Basement");
    const archived = archiveExperimentSession(created.id);
    expect(archived).not.toBeNull();

    const restored = restoreExperimentSession(created.id);
    expect(restored?.id).toBe(created.id);

    const visibleSessions = listExperimentSessions();
    expect(visibleSessions.some((entry) => entry.id === created.id)).toBe(true);
    expect(setActiveExperimentSession(created.id)).toBe(true);
    expect(getActiveExperimentSession()?.id).toBe(created.id);
  });

  it("does not archive the default session", () => {
    const result = archiveExperimentSession(DEFAULT_EXPERIMENT_SESSION_ID);
    expect(result).toBeNull();
    expect(listExperimentSessions().some((entry) => entry.id === DEFAULT_EXPERIMENT_SESSION_ID)).toBe(true);
  });
});
