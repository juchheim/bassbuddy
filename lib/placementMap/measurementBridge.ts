const MEASUREMENT_REQUEST_KEY = "subspot.v1.placementMap.pendingMeasurement";
const MEASUREMENT_REQUEST_VERSION = 1;
const MAX_REQUEST_AGE_MS = 1000 * 60 * 60 * 6;

export interface PlacementMeasurementRequest {
  version: 1;
  sessionId: string;
  pointId: string;
  pointLabel: string;
  returnHref: string;
  requestedAt: string;
}

interface StartPlacementMeasurementRequestInput {
  sessionId: string;
  pointId: string;
  pointLabel: string;
  returnHref: string;
}

function clearRawRequest(): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem(MEASUREMENT_REQUEST_KEY);
}

function isFresh(requestedAt: string): boolean {
  const timestamp = new Date(requestedAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= MAX_REQUEST_AGE_MS;
}

function parseRequest(raw: unknown): PlacementMeasurementRequest | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<PlacementMeasurementRequest>;

  if (
    candidate.version !== MEASUREMENT_REQUEST_VERSION ||
    typeof candidate.sessionId !== "string" ||
    !candidate.sessionId.trim() ||
    typeof candidate.pointId !== "string" ||
    !candidate.pointId.trim() ||
    typeof candidate.pointLabel !== "string" ||
    typeof candidate.returnHref !== "string" ||
    !candidate.returnHref.trim() ||
    typeof candidate.requestedAt !== "string"
  ) {
    return null;
  }

  if (!isFresh(candidate.requestedAt)) {
    return null;
  }

  return {
    version: 1,
    sessionId: candidate.sessionId,
    pointId: candidate.pointId,
    pointLabel: candidate.pointLabel,
    returnHref: candidate.returnHref,
    requestedAt: candidate.requestedAt
  };
}

export function startPlacementMeasurementRequest(input: StartPlacementMeasurementRequestInput): PlacementMeasurementRequest {
  const request: PlacementMeasurementRequest = {
    version: 1,
    sessionId: input.sessionId,
    pointId: input.pointId,
    pointLabel: input.pointLabel,
    returnHref: input.returnHref,
    requestedAt: new Date().toISOString()
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(MEASUREMENT_REQUEST_KEY, JSON.stringify(request));
  }

  return request;
}

export function getPlacementMeasurementRequest(): PlacementMeasurementRequest | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(MEASUREMENT_REQUEST_KEY);

    if (!raw) {
      return null;
    }

    const parsed = parseRequest(JSON.parse(raw) as unknown);

    if (!parsed) {
      clearRawRequest();
      return null;
    }

    return parsed;
  } catch {
    clearRawRequest();
    return null;
  }
}

export function consumePlacementMeasurementRequest(): PlacementMeasurementRequest | null {
  const request = getPlacementMeasurementRequest();
  clearRawRequest();
  return request;
}

export function clearPlacementMeasurementRequest(): void {
  clearRawRequest();
}
