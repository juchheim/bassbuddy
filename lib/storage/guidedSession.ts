import type { RunMode } from "@/lib/types";
import { MULTI_SEAT_LABELS } from "@/lib/constants/multiSeat";

export type GuidedMode = "ab" | "phase" | "multiseat";

export interface GuidedStep {
  stepIndex: number;
  side: "A" | "B";
  repeatIndex: number;
  repeatsPerSide: number;
  label: string;
}

export interface GuidedSessionV1 {
  version: 1;
  id: string;
  mode: GuidedMode;
  repeatsPerSide: number;
  createdAt: string;
  updatedAt: string;
  currentStepIndex: number;
  steps: GuidedStep[];
  runIds: string[];
}

export interface GuidedProgress {
  completed: number;
  total: number;
}

const GUIDED_SESSION_KEY = "bassbuddy.v1.guidedSession";
const GUIDED_SESSION_VERSION = 1;

function clampRepeats(repeatsPerSide: number): number {
  if (repeatsPerSide <= 2) {
    return 2;
  }

  return 3;
}

function isGuidedMode(mode: RunMode): mode is GuidedMode {
  return mode === "ab" || mode === "phase" || mode === "multiseat";
}

export function createGuidedSteps(mode: GuidedMode, repeatsPerSide: number): GuidedStep[] {
  if (mode === "multiseat") {
    return MULTI_SEAT_LABELS.map((entry, stepIndex) => ({
      stepIndex,
      side: entry.placement,
      repeatIndex: 1,
      repeatsPerSide: 1,
      label: entry.label
    }));
  }

  const repeats = clampRepeats(repeatsPerSide);

  const labels =
    mode === "ab"
      ? {
          A: "Placement A",
          B: "Placement B"
        }
      : {
          A: "Phase 0",
          B: "Phase 180"
        };

  const steps: GuidedStep[] = [];

  for (const side of ["A", "B"] as const) {
    for (let repeatIndex = 1; repeatIndex <= repeats; repeatIndex += 1) {
      steps.push({
        stepIndex: steps.length,
        side,
        repeatIndex,
        repeatsPerSide: repeats,
        label: labels[side]
      });
    }
  }

  return steps;
}

export function describeGuidedStep(step: GuidedStep): string {
  return `${step.label} (${step.repeatIndex}/${step.repeatsPerSide})`;
}

function parseGuidedSession(raw: unknown): GuidedSessionV1 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const parsed = raw as Partial<GuidedSessionV1>;

  if (
    parsed.version !== GUIDED_SESSION_VERSION ||
    (parsed.mode !== "ab" && parsed.mode !== "phase" && parsed.mode !== "multiseat") ||
    typeof parsed.id !== "string" ||
    typeof parsed.currentStepIndex !== "number" ||
    !Array.isArray(parsed.steps) ||
    !Array.isArray(parsed.runIds)
  ) {
    return null;
  }

  const steps = parsed.steps
    .map((step, stepIndex) => {
      if (!step || typeof step !== "object") {
      return null;
    }

      const candidate = step as Partial<GuidedStep>;

      if (
        (candidate.side !== "A" && candidate.side !== "B") ||
        typeof candidate.repeatIndex !== "number" ||
        typeof candidate.repeatsPerSide !== "number" ||
        typeof candidate.label !== "string"
      ) {
        return null;
      }

      return {
        stepIndex,
        side: candidate.side,
        repeatIndex: candidate.repeatIndex,
        repeatsPerSide: candidate.repeatsPerSide,
        label: candidate.label
      } satisfies GuidedStep;
    })
    .filter((step): step is GuidedStep => Boolean(step));

  if (!steps.length) {
    return null;
  }

  return {
    version: GUIDED_SESSION_VERSION,
    id: parsed.id,
    mode: parsed.mode,
    repeatsPerSide: parsed.mode === "multiseat" ? 1 : clampRepeats(parsed.repeatsPerSide ?? 3),
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    currentStepIndex: Math.max(0, Math.floor(parsed.currentStepIndex)),
    steps,
    runIds: parsed.runIds.filter((entry): entry is string => typeof entry === "string")
  };
}

function saveGuidedSession(session: GuidedSessionV1): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(GUIDED_SESSION_KEY, JSON.stringify(session));
}

export function clearGuidedSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(GUIDED_SESSION_KEY);
}

export function getGuidedSession(): GuidedSessionV1 | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(GUIDED_SESSION_KEY);

    if (!raw) {
      return null;
    }

    return parseGuidedSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function getGuidedSessionForMode(mode: RunMode): GuidedSessionV1 | null {
  if (!isGuidedMode(mode)) {
    return null;
  }

  const session = getGuidedSession();

  if (!session || session.mode !== mode) {
    return null;
  }

  return session;
}

export function startGuidedSession(mode: GuidedMode, repeatsPerSide = 3): GuidedSessionV1 {
  const repeats = mode === "multiseat" ? 1 : clampRepeats(repeatsPerSide);
  const now = new Date().toISOString();

  const session: GuidedSessionV1 = {
    version: GUIDED_SESSION_VERSION,
    id: crypto.randomUUID(),
    mode,
    repeatsPerSide: repeats,
    createdAt: now,
    updatedAt: now,
    currentStepIndex: 0,
    steps: createGuidedSteps(mode, repeats),
    runIds: []
  };

  saveGuidedSession(session);
  return session;
}

export function getGuidedProgress(session: GuidedSessionV1): GuidedProgress {
  return {
    completed: Math.min(session.currentStepIndex, session.steps.length),
    total: session.steps.length
  };
}

export function isGuidedSessionComplete(session: GuidedSessionV1): boolean {
  return session.currentStepIndex >= session.steps.length;
}

export function getCurrentGuidedStep(session: GuidedSessionV1): GuidedStep | null {
  if (isGuidedSessionComplete(session)) {
    return null;
  }

  return session.steps[session.currentStepIndex] ?? null;
}

export function advanceGuidedSession(runId: string): GuidedSessionV1 | null {
  const session = getGuidedSession();

  if (!session) {
    return null;
  }

  if (isGuidedSessionComplete(session)) {
    return session;
  }

  const next: GuidedSessionV1 = {
    ...session,
    currentStepIndex: session.currentStepIndex + 1,
    updatedAt: new Date().toISOString(),
    runIds: [...session.runIds, runId]
  };

  saveGuidedSession(next);
  return next;
}
