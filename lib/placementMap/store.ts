import type {
  CandidatePoint,
  MeasurementRun,
  PlacementMapSession,
  PlacementMapStoreV1,
  PlacementSessionExportPayload,
  Room,
  RoomCoordinate
} from "@/lib/placementMap/types";

export const PLACEMENT_MAP_STORAGE_KEY = "subspot.v1.placementMap";
export const PLACEMENT_MAP_STORE_VERSION = 1;
const MAX_SESSIONS = 30;
const MAX_MEASUREMENTS_PER_SESSION = 400;

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function defaultRoomName(sessionName: string): string {
  return `${sessionName} Room`;
}

function makeDefaultRoom(sessionName: string): Room {
  return {
    id: generateId("room"),
    name: defaultRoomName(sessionName),
    width: 16,
    height: 12,
    units: "ft",
    listeningPosition: {
      x: 8,
      y: 7
    }
  };
}

function defaultSessionName(existing: PlacementMapSession[]): string {
  const used = new Set(existing.map((session) => session.name.trim().toLowerCase()));

  for (let index = 1; index <= 999; index += 1) {
    const candidate = index === 1 ? "Living Room" : `Room ${index}`;

    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `Room ${Date.now()}`;
}

function createDefaultSession(existing: PlacementMapSession[] = []): PlacementMapSession {
  const now = new Date().toISOString();
  const name = defaultSessionName(existing);

  return {
    id: generateId("placement-session"),
    name,
    createdAt: now,
    updatedAt: now,
    room: makeDefaultRoom(name),
    candidatePoints: [],
    measurementRuns: []
  };
}

function emptyStore(): PlacementMapStoreV1 {
  const session = createDefaultSession();

  return {
    version: 1,
    sessions: [session],
    activeSessionId: session.id
  };
}

function sortSessions(sessions: PlacementMapSession[]): PlacementMapSession[] {
  return [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function normalizeCoordinate(value: number, max: number): number {
  return clamp(sanitizeNumber(value, max * 0.5), 0, max);
}

function normalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<Room>;

  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }

  const width = clamp(sanitizeNumber(candidate.width ?? 16, 16), 4, 60);
  const height = clamp(sanitizeNumber(candidate.height ?? 12, 12), 4, 60);

  const listeningPosition =
    candidate.listeningPosition &&
    typeof candidate.listeningPosition === "object" &&
    Number.isFinite(candidate.listeningPosition.x) &&
    Number.isFinite(candidate.listeningPosition.y)
      ? {
          x: normalizeCoordinate(candidate.listeningPosition.x, width),
          y: normalizeCoordinate(candidate.listeningPosition.y, height)
        }
      : undefined;

  return {
    id: candidate.id,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Room",
    width,
    height,
    units: "ft",
    listeningPosition,
    obstacles: Array.isArray(candidate.obstacles) ? candidate.obstacles : undefined
  };
}

function normalizeCandidate(raw: unknown, room: Room): CandidatePoint | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<CandidatePoint>;

  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }

  const rawX = typeof candidate.x === "number" ? candidate.x : Number.NaN;
  const rawY = typeof candidate.y === "number" ? candidate.y : Number.NaN;

  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: candidate.id,
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : "Point",
    x: normalizeCoordinate(rawX, room.width),
    y: normalizeCoordinate(rawY, room.height),
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
    measurementIds: Array.isArray(candidate.measurementIds)
      ? candidate.measurementIds.filter((entry): entry is string => typeof entry === "string")
      : []
  };
}

function normalizeMeasurementRun(raw: unknown, candidatePointIds: Set<string>): MeasurementRun | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<MeasurementRun>;

  if (
    typeof candidate.id !== "string" ||
    !candidate.id.trim() ||
    typeof candidate.pointId !== "string" ||
    !candidate.pointId.trim() ||
    !candidatePointIds.has(candidate.pointId)
  ) {
    return null;
  }

  const toneFrequencies = Array.isArray(candidate.toneFrequencies)
    ? candidate.toneFrequencies.filter((entry): entry is number => Number.isFinite(entry))
    : [];
  const toneLevelsDb = Array.isArray(candidate.toneLevelsDb)
    ? candidate.toneLevelsDb.filter((entry): entry is number => Number.isFinite(entry))
    : [];
  const overallScore =
    typeof candidate.overallScore === "number" && Number.isFinite(candidate.overallScore) ? candidate.overallScore : 0;
  const bandScoresRaw = candidate.bandScores && typeof candidate.bandScores === "object" ? candidate.bandScores : {};
  const bandScores = Object.entries(bandScoresRaw as Record<string, unknown>).reduce<Record<string, number>>(
    (output, [key, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        output[key] = value;
      }

      return output;
    },
    {}
  );
  const qualityFlagsRaw =
    candidate.qualityFlags && typeof candidate.qualityFlags === "object" ? candidate.qualityFlags : {};
  const qualityFlags = {
    clipped:
      typeof (qualityFlagsRaw as { clipped?: unknown }).clipped === "boolean"
        ? (qualityFlagsRaw as { clipped: boolean }).clipped
        : undefined,
    noisy:
      typeof (qualityFlagsRaw as { noisy?: unknown }).noisy === "boolean"
        ? (qualityFlagsRaw as { noisy: boolean }).noisy
        : undefined,
    unstable:
      typeof (qualityFlagsRaw as { unstable?: unknown }).unstable === "boolean"
        ? (qualityFlagsRaw as { unstable: boolean }).unstable
        : undefined
  };

  if (!toneFrequencies.length || toneFrequencies.length !== toneLevelsDb.length) {
    return null;
  }

  return {
    id: candidate.id,
    pointId: candidate.pointId,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    sourceRunId: typeof candidate.sourceRunId === "string" ? candidate.sourceRunId : undefined,
    toneFrequencies,
    toneLevelsDb,
    bandScores,
    overallScore,
    qualityFlags
  };
}

function normalizeSession(raw: unknown): PlacementMapSession | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<PlacementMapSession>;

  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    return null;
  }

  const room = normalizeRoom(candidate.room);

  if (!room) {
    return null;
  }

  const candidatePoints = Array.isArray(candidate.candidatePoints)
    ? candidate.candidatePoints
        .map((entry) => normalizeCandidate(entry, room))
        .filter((entry): entry is CandidatePoint => Boolean(entry))
    : [];

  const pointIds = new Set(candidatePoints.map((point) => point.id));
  const measurementRuns = Array.isArray(candidate.measurementRuns)
    ? candidate.measurementRuns
        .map((entry) => normalizeMeasurementRun(entry, pointIds))
        .filter((entry): entry is MeasurementRun => Boolean(entry))
    : [];

  const now = new Date().toISOString();

  return {
    id: candidate.id,
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : "Placement Session",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
    room,
    candidatePoints,
    measurementRuns: measurementRuns.slice(0, MAX_MEASUREMENTS_PER_SESSION)
  };
}

function compactSessions(sessions: PlacementMapSession[]): PlacementMapSession[] {
  const deduped = new Map<string, PlacementMapSession>();

  for (const session of sortSessions(sessions)) {
    if (!deduped.has(session.id)) {
      deduped.set(session.id, session);
    }
  }

  let compacted = Array.from(deduped.values()).slice(0, MAX_SESSIONS);

  if (!compacted.length) {
    compacted = [createDefaultSession()];
  }

  return sortSessions(compacted);
}

function resolveActiveSessionId(sessions: PlacementMapSession[], activeSessionId: string): string {
  if (sessions.some((session) => session.id === activeSessionId)) {
    return activeSessionId;
  }

  return sessions[0]?.id ?? "";
}

function migrateStore(raw: unknown): PlacementMapStoreV1 {
  if (!raw || typeof raw !== "object") {
    return emptyStore();
  }

  const candidate = raw as Partial<PlacementMapStoreV1>;

  if (candidate.version !== 1 || !Array.isArray(candidate.sessions)) {
    return emptyStore();
  }

  const sessions = compactSessions(
    candidate.sessions.map((entry) => normalizeSession(entry)).filter((entry): entry is PlacementMapSession => Boolean(entry))
  );
  const activeSessionId = resolveActiveSessionId(
    sessions,
    typeof candidate.activeSessionId === "string" ? candidate.activeSessionId : ""
  );

  return {
    version: 1,
    sessions,
    activeSessionId
  };
}

function loadStore(): PlacementMapStoreV1 {
  if (typeof window === "undefined") {
    return emptyStore();
  }

  try {
    const raw = localStorage.getItem(PLACEMENT_MAP_STORAGE_KEY);

    if (!raw) {
      const fallback = emptyStore();
      localStorage.setItem(PLACEMENT_MAP_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }

    const migrated = migrateStore(JSON.parse(raw) as unknown);
    localStorage.setItem(PLACEMENT_MAP_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    const fallback = emptyStore();
    localStorage.setItem(PLACEMENT_MAP_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveStore(store: PlacementMapStoreV1): PlacementMapStoreV1 {
  const sessions = compactSessions(store.sessions);
  const nextStore: PlacementMapStoreV1 = {
    version: 1,
    sessions,
    activeSessionId: resolveActiveSessionId(sessions, store.activeSessionId)
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(PLACEMENT_MAP_STORAGE_KEY, JSON.stringify(nextStore));
  }

  return nextStore;
}

function withSessionUpdate<T>(
  sessionId: string,
  updater: (session: PlacementMapSession) => { session: PlacementMapSession; result: T } | null
): T | null {
  const store = loadStore();
  let updated = false;
  let result: T | null = null;

  const nextSessions = store.sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    const outcome = updater(session);

    if (!outcome) {
      return session;
    }

    updated = true;
    result = outcome.result;

    return {
      ...outcome.session,
      updatedAt: new Date().toISOString()
    };
  });

  if (!updated) {
    return null;
  }

  saveStore({
    ...store,
    sessions: nextSessions
  });

  return result;
}

function nextPointLabel(candidatePoints: CandidatePoint[]): string {
  const used = new Set(candidatePoints.map((point) => point.label.trim().toLowerCase()));

  for (let index = 1; index <= 999; index += 1) {
    const label = `Point ${index}`;

    if (!used.has(label.toLowerCase())) {
      return label;
    }
  }

  return `Point ${Date.now()}`;
}

export function listPlacementSessions(): PlacementMapSession[] {
  return sortSessions(loadStore().sessions);
}

export function getPlacementSessionById(sessionId: string): PlacementMapSession | null {
  return loadStore().sessions.find((session) => session.id === sessionId) ?? null;
}

export function getActivePlacementSessionId(): string {
  const store = loadStore();

  if (store.activeSessionId) {
    return store.activeSessionId;
  }

  const activeSessionId = store.sessions[0]?.id ?? "";

  if (activeSessionId) {
    saveStore({
      ...store,
      activeSessionId
    });
  }

  return activeSessionId;
}

export function getActivePlacementSession(): PlacementMapSession | null {
  const activeSessionId = getActivePlacementSessionId();
  return getPlacementSessionById(activeSessionId);
}

export function setActivePlacementSession(sessionId: string): boolean {
  const store = loadStore();

  if (!store.sessions.some((session) => session.id === sessionId)) {
    return false;
  }

  saveStore({
    ...store,
    activeSessionId: sessionId
  });

  return true;
}

export function createPlacementSession(name = ""): PlacementMapSession {
  const store = loadStore();
  const now = new Date().toISOString();
  const fallbackName = defaultSessionName(store.sessions);
  const nextName = name.trim() || fallbackName;

  const session: PlacementMapSession = {
    id: generateId("placement-session"),
    name: nextName,
    createdAt: now,
    updatedAt: now,
    room: makeDefaultRoom(nextName),
    candidatePoints: [],
    measurementRuns: []
  };

  saveStore({
    ...store,
    sessions: [session, ...store.sessions],
    activeSessionId: session.id
  });

  return session;
}

export function renamePlacementSession(sessionId: string, name: string): PlacementMapSession | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return null;
  }

  return withSessionUpdate(sessionId, (session) => ({
    session: {
      ...session,
      name: trimmed,
      room: {
        ...session.room,
        name: session.room.name === defaultRoomName(session.name) ? defaultRoomName(trimmed) : session.room.name
      }
    },
    result: {
      ...session,
      name: trimmed
    }
  }));
}

export function deletePlacementSession(sessionId: string): boolean {
  const store = loadStore();

  if (store.sessions.length <= 1) {
    return false;
  }

  const nextSessions = store.sessions.filter((session) => session.id !== sessionId);

  if (nextSessions.length === store.sessions.length) {
    return false;
  }

  saveStore({
    ...store,
    sessions: nextSessions,
    activeSessionId: resolveActiveSessionId(nextSessions, store.activeSessionId)
  });

  return true;
}

export interface UpdateRoomInput {
  name?: string;
  width?: number;
  height?: number;
}

export function updatePlacementRoom(sessionId: string, updates: UpdateRoomInput): Room | null {
  return withSessionUpdate(sessionId, (session) => {
    const width = Number.isFinite(updates.width) ? clamp(updates.width ?? session.room.width, 4, 60) : session.room.width;
    const height = Number.isFinite(updates.height)
      ? clamp(updates.height ?? session.room.height, 4, 60)
      : session.room.height;

    const listeningPosition = session.room.listeningPosition
      ? {
          x: normalizeCoordinate(session.room.listeningPosition.x, width),
          y: normalizeCoordinate(session.room.listeningPosition.y, height)
        }
      : undefined;

    const candidatePoints = session.candidatePoints.map((point) => ({
      ...point,
      x: normalizeCoordinate(point.x, width),
      y: normalizeCoordinate(point.y, height)
    }));

    const room: Room = {
      ...session.room,
      name: updates.name?.trim() ? updates.name.trim() : session.room.name,
      width,
      height,
      listeningPosition
    };

    return {
      session: {
        ...session,
        room,
        candidatePoints
      },
      result: room
    };
  });
}

export function setPlacementListeningPosition(sessionId: string, position: RoomCoordinate | null): RoomCoordinate | null {
  return withSessionUpdate(sessionId, (session) => {
    const listeningPosition = position
      ? {
          x: normalizeCoordinate(position.x, session.room.width),
          y: normalizeCoordinate(position.y, session.room.height)
        }
      : undefined;

    return {
      session: {
        ...session,
        room: {
          ...session.room,
          listeningPosition
        }
      },
      result: listeningPosition ?? null
    };
  });
}

export interface AddCandidatePointInput {
  x: number;
  y: number;
  label?: string;
}

export function addCandidatePoint(sessionId: string, input: AddCandidatePointInput): CandidatePoint | null {
  return withSessionUpdate(sessionId, (session) => {
    const now = new Date().toISOString();
    const point: CandidatePoint = {
      id: generateId("point"),
      label: input.label?.trim() || nextPointLabel(session.candidatePoints),
      x: normalizeCoordinate(input.x, session.room.width),
      y: normalizeCoordinate(input.y, session.room.height),
      createdAt: now,
      updatedAt: now,
      measurementIds: []
    };

    return {
      session: {
        ...session,
        candidatePoints: [...session.candidatePoints, point]
      },
      result: point
    };
  });
}

export interface UpdateCandidatePointInput {
  x?: number;
  y?: number;
  label?: string;
}

export function updateCandidatePoint(
  sessionId: string,
  pointId: string,
  updates: UpdateCandidatePointInput
): CandidatePoint | null {
  return withSessionUpdate(sessionId, (session) => {
    let updated: CandidatePoint | null = null;

    const candidatePoints = session.candidatePoints.map((point) => {
      if (point.id !== pointId) {
        return point;
      }

      updated = {
        ...point,
        label: typeof updates.label === "string" && updates.label.trim() ? updates.label.trim() : point.label,
        x: Number.isFinite(updates.x) ? normalizeCoordinate(updates.x ?? point.x, session.room.width) : point.x,
        y: Number.isFinite(updates.y) ? normalizeCoordinate(updates.y ?? point.y, session.room.height) : point.y,
        updatedAt: new Date().toISOString()
      };

      return updated;
    });

    if (!updated) {
      return null;
    }

    return {
      session: {
        ...session,
        candidatePoints
      },
      result: updated
    };
  });
}

export function deleteCandidatePoint(sessionId: string, pointId: string): boolean {
  const removed = withSessionUpdate(sessionId, (session) => {
    const candidatePoints = session.candidatePoints.filter((point) => point.id !== pointId);

    if (candidatePoints.length === session.candidatePoints.length) {
      return null;
    }

    const measurementRuns = session.measurementRuns.filter((run) => run.pointId !== pointId);

    return {
      session: {
        ...session,
        candidatePoints,
        measurementRuns
      },
      result: true
    };
  });

  return Boolean(removed);
}

export interface SaveMeasurementRunInput {
  id?: string;
  pointId: string;
  sourceRunId?: string;
  createdAt?: string;
  toneFrequencies: number[];
  toneLevelsDb: number[];
  bandScores: Record<string, number>;
  overallScore: number;
  qualityFlags: MeasurementRun["qualityFlags"];
}

export function savePlacementMeasurementRun(
  sessionId: string,
  input: SaveMeasurementRunInput
): MeasurementRun | null {
  return withSessionUpdate(sessionId, (session) => {
    const point = session.candidatePoints.find((candidatePoint) => candidatePoint.id === input.pointId);

    if (!point) {
      return null;
    }

    const run: MeasurementRun = {
      id: input.id ?? generateId("placement-run"),
      pointId: input.pointId,
      sourceRunId: input.sourceRunId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      toneFrequencies: [...input.toneFrequencies],
      toneLevelsDb: [...input.toneLevelsDb],
      bandScores: { ...input.bandScores },
      overallScore: clamp(input.overallScore, 0, 100),
      qualityFlags: { ...input.qualityFlags }
    };

    const withoutPrevious = session.measurementRuns.filter((entry) => entry.id !== run.id);
    const measurementRuns = [run, ...withoutPrevious].slice(0, MAX_MEASUREMENTS_PER_SESSION);

    const candidatePoints = session.candidatePoints.map((entry) => {
      if (entry.id !== input.pointId) {
        return entry;
      }

      const measurementIds = [run.id, ...entry.measurementIds.filter((measurementId) => measurementId !== run.id)];

      return {
        ...entry,
        updatedAt: new Date().toISOString(),
        measurementIds
      };
    });

    return {
      session: {
        ...session,
        candidatePoints,
        measurementRuns
      },
      result: run
    };
  });
}

export function getLatestMeasurementForPoint(
  session: PlacementMapSession,
  pointId: string
): MeasurementRun | null {
  const matchingRuns = session.measurementRuns.filter((run) => run.pointId === pointId);

  if (!matchingRuns.length) {
    return null;
  }

  return [...matchingRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export function exportPlacementSessionPayload(sessionId: string): PlacementSessionExportPayload | null {
  const session = getPlacementSessionById(sessionId);

  if (!session) {
    return null;
  }

  return {
    type: "subspot.placement-session.v1",
    version: 1,
    exportedAt: new Date().toISOString(),
    session
  };
}
