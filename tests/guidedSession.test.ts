import { describe, expect, it } from "vitest";
import {
  createGuidedSteps,
  describeGuidedStep,
  getCurrentGuidedStep,
  getGuidedProgress,
  isGuidedSessionComplete,
  type GuidedSessionV1
} from "@/lib/storage/guidedSession";

function makeSession(overrides: Partial<GuidedSessionV1> = {}): GuidedSessionV1 {
  const steps = overrides.steps ?? createGuidedSteps("ab", 3);

  return {
    version: 1,
    id: overrides.id ?? "session-1",
    mode: overrides.mode ?? "ab",
    repeatsPerSide: overrides.repeatsPerSide ?? 3,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    currentStepIndex: overrides.currentStepIndex ?? 0,
    steps,
    runIds: overrides.runIds ?? []
  };
}

describe("createGuidedSteps", () => {
  it("creates ordered A then B steps for AB mode", () => {
    const steps = createGuidedSteps("ab", 3);

    expect(steps).toHaveLength(6);
    expect(steps[0]?.label).toBe("Placement A");
    expect(steps[2]?.repeatIndex).toBe(3);
    expect(steps[3]?.label).toBe("Placement B");
    expect(steps[5]?.repeatIndex).toBe(3);
  });

  it("creates phase labels for phase mode", () => {
    const steps = createGuidedSteps("phase", 2);

    expect(steps).toHaveLength(4);
    expect(steps[0]?.label).toBe("Phase 0");
    expect(steps[2]?.label).toBe("Phase 180");
  });

  it("clamps repeats to supported 2-3 range", () => {
    expect(createGuidedSteps("ab", 1)).toHaveLength(4);
    expect(createGuidedSteps("ab", 99)).toHaveLength(6);
  });
});

describe("guided session helpers", () => {
  it("returns current step and progress before completion", () => {
    const session = makeSession({ currentStepIndex: 1 });

    const step = getCurrentGuidedStep(session);
    const progress = getGuidedProgress(session);

    expect(step).not.toBeNull();
    expect(describeGuidedStep(step!)).toContain("Placement A");
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(6);
    expect(isGuidedSessionComplete(session)).toBe(false);
  });

  it("marks complete when index reaches steps length", () => {
    const session = makeSession({ currentStepIndex: 6 });

    expect(isGuidedSessionComplete(session)).toBe(true);
    expect(getCurrentGuidedStep(session)).toBeNull();
  });
});
