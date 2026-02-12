import { scorePlacementResponse } from "@/lib/placementMap/scoring";
import { addCandidatePoint, createPlacementSession, savePlacementMeasurementRun } from "@/lib/placementMap/store";
import type { BassRun } from "@/lib/types";

export interface ImportedQuickTestResult {
  sessionId: string;
  pointId: string;
  measurementRunId: string;
}

function deriveQualityFlags(run: BassRun): { clipped?: boolean; noisy?: boolean; unstable?: boolean } {
  const issueText = (run.quality?.issues ?? []).join(" ").toLowerCase();
  const notesText = (run.notes ?? "").toLowerCase();

  return {
    clipped:
      issueText.includes("clipping") || notesText.includes("clipping")
        ? true
        : undefined,
    noisy:
      issueText.includes("quiet") || issueText.includes("noise") || notesText.includes("quiet")
        ? true
        : undefined,
    unstable: run.confidence !== "high" ? true : undefined
  };
}

export function importQuickTestIntoPlacementSession(run: BassRun): ImportedQuickTestResult {
  const sessionName = `Placement Session (${new Date().toLocaleDateString()})`;
  const session = createPlacementSession(sessionName);

  const point = addCandidatePoint(session.id, {
    x: session.room.width * 0.24,
    y: session.room.height * 0.5,
    label: run.label?.trim() || "Imported Quick Test"
  });

  if (!point) {
    throw new Error("Could not create first placement point.");
  }

  const toneFrequencies = run.measurements.map((measurement) => measurement.freqHz);
  const toneLevelsDb = run.measurements.map((measurement) => measurement.levelRelDb);
  const scoring = scorePlacementResponse(toneFrequencies, toneLevelsDb);

  const measurementRun = savePlacementMeasurementRun(session.id, {
    pointId: point.id,
    sourceRunId: run.id,
    createdAt: run.createdAt,
    toneFrequencies,
    toneLevelsDb,
    bandScores: scoring.bandScores,
    overallScore: scoring.overall.score,
    qualityFlags: deriveQualityFlags(run)
  });

  if (!measurementRun) {
    throw new Error("Could not save imported measurement for placement map.");
  }

  return {
    sessionId: session.id,
    pointId: point.id,
    measurementRunId: measurementRun.id
  };
}
