export type DistanceUnit = "ft";

export interface RoomCoordinate {
  x: number;
  y: number;
}

export interface RoomObstacle {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Room {
  id: string;
  name: string;
  width: number;
  height: number;
  units: DistanceUnit;
  listeningPosition?: RoomCoordinate;
  // TODO: Enable interactive obstacle editing and convex-hull masking around obstacles.
  obstacles?: RoomObstacle[];
}

export interface CandidatePoint {
  id: string;
  label: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
  measurementIds: string[];
}

export interface MeasurementQualityFlags {
  clipped?: boolean;
  noisy?: boolean;
  unstable?: boolean;
}

export interface MeasurementRun {
  id: string;
  pointId: string;
  createdAt: string;
  sourceRunId?: string;
  toneFrequencies: number[];
  toneLevelsDb: number[];
  bandScores: Record<string, number>;
  overallScore: number;
  qualityFlags: MeasurementQualityFlags;
}

export interface PlacementMapSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  room: Room;
  candidatePoints: CandidatePoint[];
  measurementRuns: MeasurementRun[];
}

export interface PlacementMapStoreV1 {
  version: 1;
  sessions: PlacementMapSession[];
  activeSessionId: string;
}

export interface PlacementSessionExportPayload {
  type: "subspot.placement-session.v1";
  version: 1;
  exportedAt: string;
  session: PlacementMapSession;
}
