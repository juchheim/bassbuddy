import { MULTI_SEAT_LABELS } from "@/lib/constants/multiSeat";
import { clampScoutCandidates, scoutLabel } from "@/lib/constants/scout";
import type { RunMode } from "@/lib/types";

export type GuidedMode = "ab" | "phase" | "multiseat" | "scout";

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

export interface GuidedLabelOverrides {
  A?: string;
  B?: string;
}

export interface StartGuidedSessionOptions {
  labelOverrides?: GuidedLabelOverrides;
}

export interface ImportGuidedSessionOptions {
  replaceExisting?: boolean;
}

export interface ImportGuidedSessionResult {
  imported: boolean;
  replaced: boolean;
  cleared: boolean;
  active: boolean;
}

const GUIDED_SESSION_KEY = "subspot.v1.guidedSession";
const GUIDED_SESSION_VERSION = 1;

function clampRepeats(repeatsPerSide: number): number {
  if (repeatsPerSide <= 2) {
    return 2;
  }

  return 3;
}

function normalizeGuidedCount(mode: GuidedMode, repeatsPerSide: number): number {
  if (mode === "multiseat") {
    return 1;
  }

  if (mode === "scout") {
    return clampScoutCandidates(repeatsPerSide);
  }

  return clampRepeats(repeatsPerSide);
}

function isGuidedMode(mode: RunMode): mode is GuidedMode {
  return mode === "ab" || mode === "phase" || mode === "multiseat" || mode === "scout";
}

export function createGuidedSteps(
  mode: GuidedMode,
  repeatsPerSide: number,
  options?: StartGuidedSessionOptions
): GuidedStep[] {
  if (mode === "multiseat") {
    return MULTI_SEAT_LABELS.map((entry, stepIndex) => ({
      stepIndex,
      side: entry.placement,
      repeatIndex: 1,
      repeatsPerSide: 1,
      label: entry.label
    }));
  }

  if (mode === "scout") {
    const candidates = clampScoutCandidates(repeatsPerSide);

    return Array.from({ length: candidates }, (_, index) => {
      const repeatIndex = index + 1;

      return {
        stepIndex: index,
        side: "A",
        repeatIndex,
        repeatsPerSide: candidates,
        label: scoutLabel(repeatIndex)
      } satisfies GuidedStep;
    });
  }

  const repeats = clampRepeats(repeatsPerSide);

  const labels =
    mode === "ab"
      ? {
          A: options?.labelOverrides?.A?.trim() || "Placement A",
          B: options?.labelOverrides?.B?.trim() || "Placement B"
        }
      : {
          A: options?.labelOverrides?.A?.trim() || "Phase 0",
          B: options?.labelOverrides?.B?.trim() || "Phase 180"
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
  if (step.repeatsPerSide <= 1) {
    return step.label;
  }

  return `${step.label} (${step.repeatIndex}/${step.repeatsPerSide})`;
}

function parseGuidedSession(raw: unknown): GuidedSessionV1 | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const parsed = raw as Partial<GuidedSessionV1>;

  if (
    parsed.version !== GUIDED_SESSION_VERSION ||
    (parsed.mode !== "ab" && parsed.mode !== "phase" && parsed.mode !== "multiseat" && parsed.mode !== "scout") ||
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
    repeatsPerSide: normalizeGuidedCount(parsed.mode, parsed.repeatsPerSide ?? 3),
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

function writeGuidedSession(session: GuidedSessionV1 | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    localStorage.removeItem(GUIDED_SESSION_KEY);
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

export function exportGuidedSessionPayload(): GuidedSessionV1 | null {
  return getGuidedSession();
}

export function importGuidedSessionPayload(
  payload: unknown,
  options?: ImportGuidedSessionOptions
): ImportGuidedSessionResult {
  const existing = getGuidedSession();
  const parsedCandidate =
    payload && typeof payload === "object" && "guidedSession" in payload
      ? parseGuidedSession((payload as { guidedSession?: unknown }).guidedSession)
      : parseGuidedSession(payload);

  if (!parsedCandidate) {
    if (options?.replaceExisting && existing) {
      writeGuidedSession(null);
      return {
        imported: false,
        replaced: false,
        cleared: true,
        active: false
      };
    }

    return {
      imported: false,
      replaced: false,
      cleared: false,
      active: Boolean(existing)
    };
  }

  if (!existing) {
    writeGuidedSession(parsedCandidate);
    return {
      imported: true,
      replaced: false,
      cleared: false,
      active: true
    };
  }

  if (options?.replaceExisting) {
    writeGuidedSession(parsedCandidate);
    return {
      imported: true,
      replaced: true,
      cleared: false,
      active: true
    };
  }

  const existingUpdatedAt = new Date(existing.updatedAt).getTime();
  const incomingUpdatedAt = new Date(parsedCandidate.updatedAt).getTime();
  const shouldReplace = Number.isFinite(incomingUpdatedAt) && incomingUpdatedAt > existingUpdatedAt;

  if (shouldReplace) {
    writeGuidedSession(parsedCandidate);
    return {
      imported: true,
      replaced: true,
      cleared: false,
      active: true
    };
  }

  return {
    imported: false,
    replaced: false,
    cleared: false,
    active: true
  };
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

export function startGuidedSession(
  mode: GuidedMode,
  repeatsPerSide = 3,
  options?: StartGuidedSessionOptions
): GuidedSessionV1 {
  const repeats = normalizeGuidedCount(mode, repeatsPerSide);
  const now = new Date().toISOString();

  const session: GuidedSessionV1 = {
    version: GUIDED_SESSION_VERSION,
    id: crypto.randomUUID(),
    mode,
    repeatsPerSide: repeats,
    createdAt: now,
    updatedAt: now,
    currentStepIndex: 0,
    steps: createGuidedSteps(mode, repeats, options),
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
