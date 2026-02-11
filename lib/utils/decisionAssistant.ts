import type { BassRun } from "@/lib/types";
import { compareRuns } from "@/lib/utils/compareRuns";
import { clamp } from "@/lib/utils/math";
import { evaluateMultiSeatDecision } from "@/lib/utils/multiSeat";
import { buildRepeatabilityProfile, evaluateRepeatabilityDecision } from "@/lib/utils/repeatability";
import { buildScoutRanking } from "@/lib/utils/scout";
import { evaluateCompareReadiness, evaluateRunGroupVolumeConsistency } from "@/lib/utils/runQuality";

export type ConfidenceTier = "high" | "medium" | "low";

export interface DecisionEvidence {
  source: string;
  winner: string | null;
  canDeclare: boolean;
  rationale: string;
  blockers: string[];
  warnings: string[];
}

export interface DecisionSection {
  available: boolean;
  winner: string | null;
  confidence: ConfidenceTier;
  confidenceScore: number;
  rationale: string;
  blockers: string[];
  warnings: string[];
  nextActions: string[];
  evidence: DecisionEvidence[];
}

export interface DecisionReport {
  generatedAt: string;
  overallConfidence: ConfidenceTier;
  overallScore: number;
  summary: string;
  nextActions: string[];
  placement: DecisionSection;
  phase: DecisionSection;
  scout: {
    candidateCount: number;
    topTwo: string[];
  };
}

export interface DecisionReportDelta {
  overallScoreDelta: number;
  overallConfidenceChanged: boolean;
  placementWinnerChanged: boolean;
  phaseWinnerChanged: boolean;
}

type PairSide = "left" | "right";

interface PairDecisionInput {
  runs: BassRun[];
  leftDisplay: string;
  rightDisplay: string;
  parseSide: (label: string | undefined) => PairSide | null;
  sourceLabel: string;
  allowRepeatability: boolean;
}

interface PairDecisionOutput {
  available: boolean;
  winner: PairSide | "tie" | null;
  canDeclare: boolean;
  rationale: string;
  blockers: string[];
  warnings: string[];
  confidenceScore: number;
  confidence: ConfidenceTier;
  evidence: DecisionEvidence;
  selectedRuns: BassRun[];
}

function confidenceTierFromScore(score: number): ConfidenceTier {
  if (score >= 75) {
    return "high";
  }

  if (score >= 50) {
    return "medium";
  }

  return "low";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.trim().length > 0)));
}

function parsePlacementSide(label: string | undefined): PairSide | null {
  const normalized = label?.trim().toLowerCase() ?? "";

  if (normalized.startsWith("placement a")) {
    return "left";
  }

  if (normalized.startsWith("placement b")) {
    return "right";
  }

  return null;
}

function parsePhaseSide(label: string | undefined): PairSide | null {
  const normalized = label?.trim().toLowerCase() ?? "";

  if (normalized.startsWith("phase 0")) {
    return "left";
  }

  if (normalized.startsWith("phase 180")) {
    return "right";
  }

  return null;
}

function mapWinnerToSide(
  winnerId: string | "tie",
  leftRun: BassRun,
  rightRun: BassRun
): PairSide | "tie" {
  if (winnerId === "tie") {
    return "tie";
  }

  return winnerId === leftRun.id ? "left" : "right";
}

function evaluatePairDecision(input: PairDecisionInput): PairDecisionOutput {
  const leftRuns = input.runs.filter((run) => input.parseSide(run.label) === "left");
  const rightRuns = input.runs.filter((run) => input.parseSide(run.label) === "right");

  const missingLeft = leftRuns.length === 0;
  const missingRight = rightRuns.length === 0;

  if (missingLeft || missingRight) {
    const blockers: string[] = [];

    if (missingLeft) {
      blockers.push(`${input.sourceLabel}: missing ${input.leftDisplay} measurement(s).`);
    }

    if (missingRight) {
      blockers.push(`${input.sourceLabel}: missing ${input.rightDisplay} measurement(s).`);
    }

    const score = clamp(20 - blockers.length * 10, 0, 100);

    return {
      available: false,
      winner: null,
      canDeclare: false,
      rationale: "Not enough side-labeled runs to compare yet.",
      blockers,
      warnings: [],
      confidenceScore: score,
      confidence: confidenceTierFromScore(score),
      evidence: {
        source: input.sourceLabel,
        winner: null,
        canDeclare: false,
        rationale: "Insufficient side-labeled runs.",
        blockers,
        warnings: []
      },
      selectedRuns: []
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];

  let leftRun = leftRuns[0];
  let rightRun = rightRuns[0];
  let selectedRuns: BassRun[] = [leftRun, rightRun];
  let repeatabilityUsed = false;
  let repeatabilityGateReason: string | null = null;

  if (input.allowRepeatability && leftRuns.length >= 2 && rightRuns.length >= 2) {
    const profileLeft = buildRepeatabilityProfile(input.leftDisplay, leftRuns, 3);
    const profileRight = buildRepeatabilityProfile(input.rightDisplay, rightRuns, 3);

    if (profileLeft && profileRight) {
      repeatabilityUsed = true;
      leftRun = profileLeft.aggregateRun;
      rightRun = profileRight.aggregateRun;
      selectedRuns = [...profileLeft.sourceRuns, ...profileRight.sourceRuns];

      const repeatabilityDecision = evaluateRepeatabilityDecision(profileLeft, profileRight);

      if (!repeatabilityDecision.canDeclareWinner) {
        repeatabilityGateReason = repeatabilityDecision.reason;
        blockers.push(`${input.sourceLabel}: ${repeatabilityDecision.reason}`);
      }
    }
  }

  const readiness = evaluateCompareReadiness(leftRun, rightRun);
  blockers.push(...readiness.blockers.map((entry) => `${input.sourceLabel}: ${entry}`));
  warnings.push(...readiness.warnings.map((entry) => `${input.sourceLabel}: ${entry}`));

  const volumeConsistency = evaluateRunGroupVolumeConsistency(selectedRuns);

  if (volumeConsistency?.severity === "block") {
    blockers.push(
      `${input.sourceLabel}: run-group volume drift is high (${volumeConsistency.maxDeltaDb.toFixed(1)} dB).`
    );
  } else if (volumeConsistency?.severity === "warn") {
    warnings.push(
      `${input.sourceLabel}: run-group volume drift warning (${volumeConsistency.maxDeltaDb.toFixed(1)} dB).`
    );
  }

  const decision = compareRuns(leftRun, rightRun);
  const winner = mapWinnerToSide(decision.winnerId, leftRun, rightRun);
  const canDeclare = blockers.length === 0 && winner !== "tie";

  let score = 50;

  if (winner !== "tie") {
    score += 20;
  }

  if (canDeclare) {
    score += 15;
  }

  if (repeatabilityUsed) {
    score += 10;
  }

  if (readiness.repeatability?.verdict === "high") {
    score += 6;
  } else if (readiness.repeatability?.verdict === "moderate") {
    score += 3;
  }

  score -= Math.min(blockers.length, 4) * 14;
  score -= Math.min(warnings.length, 6) * 4;
  score = clamp(score, 0, 100);

  const mappedWinner =
    winner === "left" ? input.leftDisplay : winner === "right" ? input.rightDisplay : "Tie";

  const rationaleParts = [decision.reason];

  if (repeatabilityGateReason) {
    rationaleParts.push(`Repeatability gate: ${repeatabilityGateReason}`);
  }

  if (volumeConsistency) {
    rationaleParts.push(
      `Volume spread: ${volumeConsistency.maxDeltaDb.toFixed(1)} dB (median ref ${volumeConsistency.referenceDb.toFixed(
        1
      )} dB).`
    );
  }

  const rationale = rationaleParts.join(" ");

  return {
    available: true,
    winner,
    canDeclare,
    rationale,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    confidenceScore: score,
    confidence: confidenceTierFromScore(score),
    evidence: {
      source: input.sourceLabel,
      winner: canDeclare ? mappedWinner : null,
      canDeclare,
      rationale,
      blockers: uniqueStrings(blockers),
      warnings: uniqueStrings(warnings)
    },
    selectedRuns
  };
}

function evaluatePlacementSection(allRuns: BassRun[]): DecisionSection {
  const abRuns = allRuns.filter((run) => run.mode === "ab");
  const multiSeatRuns = allRuns.filter((run) => run.mode === "multiseat");
  const scoutRuns = allRuns.filter((run) => run.mode === "scout");
  const scoutRanking = buildScoutRanking(scoutRuns);

  const abDecision = evaluatePairDecision({
    runs: abRuns,
    leftDisplay: "Placement A",
    rightDisplay: "Placement B",
    parseSide: parsePlacementSide,
    sourceLabel: "Seat A/B compare",
    allowRepeatability: true
  });

  const multiSeat = evaluateMultiSeatDecision(multiSeatRuns);
  const multiSeatAvailable = multiSeatRuns.length > 0;
  const multiSeatCanDeclare = multiSeat.canDeclareWinner && (multiSeat.winner === "A" || multiSeat.winner === "B");
  const multiSeatWinner = multiSeat.winner === "A" ? "Placement A" : multiSeat.winner === "B" ? "Placement B" : null;

  const evidence: DecisionEvidence[] = [abDecision.evidence];

  if (multiSeatAvailable) {
    evidence.push({
      source: "Multi-seat compromise",
      winner: multiSeatCanDeclare ? multiSeatWinner : null,
      canDeclare: multiSeatCanDeclare,
      rationale: multiSeat.reason,
      blockers: multiSeat.blockers,
      warnings: multiSeat.warnings
    });
  }

  const blockers = uniqueStrings([
    ...abDecision.blockers,
    ...(multiSeatAvailable ? multiSeat.blockers : [])
  ]);
  const warnings = uniqueStrings([
    ...abDecision.warnings,
    ...(multiSeatAvailable ? multiSeat.warnings : [])
  ]);

  const declaredWinners: string[] = [];

  if (abDecision.canDeclare && abDecision.winner) {
    declaredWinners.push(abDecision.winner === "left" ? "Placement A" : "Placement B");
  }

  if (multiSeatCanDeclare && multiSeatWinner) {
    declaredWinners.push(multiSeatWinner);
  }

  let winner: string | null = null;
  let rationale = "Not enough evidence to declare a placement winner.";

  if (declaredWinners.length === 1) {
    winner = declaredWinners[0];
    rationale = `${winner} currently leads by the strongest available evidence.`;
  } else if (declaredWinners.length >= 2) {
    if (declaredWinners.every((entry) => entry === declaredWinners[0])) {
      winner = declaredWinners[0];
      rationale = `${winner} wins in both seat A/B and multi-seat compromise evidence.`;
    } else {
      blockers.push(
        "Placement evidence conflicts between seat A/B and multi-seat compromise. Re-run both flows before finalizing."
      );
      rationale = "Seat A/B and multi-seat evidence disagree, so no final placement winner is declared.";
    }
  } else if (multiSeatAvailable && !multiSeatCanDeclare) {
    rationale = "Multi-seat evidence exists but did not clear quality/variance gates.";
  } else if (abRuns.length) {
    rationale = "A/B evidence exists but did not clear quality/repeatability gates.";
  }

  let score = 30;

  if (winner) {
    score += 35;
  }

  if (abDecision.canDeclare) {
    score += 15;
  }

  if (multiSeatCanDeclare) {
    score += 15;
  }

  if (declaredWinners.length >= 2 && winner) {
    score += 10;
  }

  if (scoutRanking.topTwo) {
    score += 5;
  }

  score -= Math.min(blockers.length, 5) * 10;
  score -= Math.min(warnings.length, 6) * 3;
  score = clamp(score, 0, 100);

  const nextActions: string[] = [];

  if (!abRuns.length) {
    nextActions.push("Run guided A/B seat compare (2-3 runs per side).");
  }

  if (!multiSeatRuns.length) {
    nextActions.push("Run Multi-Seat Compromise to validate the winner across seats.");
  }

  if (scoutRanking.topTwo && !abDecision.canDeclare) {
    nextActions.push("Promote scout top-two locations into guided A/B and rerun from the listening seat.");
  }

  if (blockers.some((entry) => entry.toLowerCase().includes("volume"))) {
    nextActions.push("Re-run captures at identical playback volume to remove level-drift blockers.");
  }

  if (blockers.some((entry) => entry.toLowerCase().includes("quality"))) {
    nextActions.push("Retake poor-quality runs (clipping/quiet/processing issues) before deciding.");
  }

  if (winner) {
    nextActions.push(`Keep ${winner} as the current placement baseline while finishing phase checks.`);
  } else {
    nextActions.push("Do one clean retake cycle before making a final placement call.");
  }

  return {
    available: abRuns.length > 0 || multiSeatRuns.length > 0,
    winner,
    confidence: confidenceTierFromScore(score),
    confidenceScore: score,
    rationale,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    nextActions: uniqueStrings(nextActions),
    evidence
  };
}

function evaluatePhaseSection(allRuns: BassRun[]): DecisionSection {
  const phaseRuns = allRuns.filter((run) => run.mode === "phase");

  const phaseDecision = evaluatePairDecision({
    runs: phaseRuns,
    leftDisplay: "Phase 0°",
    rightDisplay: "Phase 180°",
    parseSide: parsePhaseSide,
    sourceLabel: "Phase compare",
    allowRepeatability: true
  });

  const winner =
    phaseDecision.canDeclare && phaseDecision.winner === "left"
      ? "Phase 0°"
      : phaseDecision.canDeclare && phaseDecision.winner === "right"
      ? "Phase 180°"
      : null;

  const blockers = [...phaseDecision.blockers];
  const warnings = [...phaseDecision.warnings];
  const nextActions: string[] = [];

  if (!phaseRuns.length) {
    nextActions.push("Run Phase Test (0° vs 180°) after placement is settled.");
  } else if (!phaseDecision.canDeclare) {
    nextActions.push("Repeat phase test with 2-3 runs per side for a stable result.");
  }

  if (blockers.some((entry) => entry.toLowerCase().includes("volume"))) {
    nextActions.push("Retake phase runs at matched playback volume.");
  }

  if (blockers.some((entry) => entry.toLowerCase().includes("quality"))) {
    nextActions.push("Retake poor-quality phase runs before trusting the phase recommendation.");
  }

  if (winner) {
    nextActions.push(`Set sub phase switch to ${winner.replace("Phase ", "")} and verify with one baseline re-check.`);
  }

  const score =
    phaseRuns.length === 0
      ? 25
      : clamp(phaseDecision.confidenceScore + (phaseDecision.canDeclare ? 10 : -10), 0, 100);

  return {
    available: phaseRuns.length > 0,
    winner,
    confidence: confidenceTierFromScore(score),
    confidenceScore: score,
    rationale: phaseDecision.rationale,
    blockers: uniqueStrings(blockers),
    warnings: uniqueStrings(warnings),
    nextActions: uniqueStrings(nextActions),
    evidence: [phaseDecision.evidence]
  };
}

export function buildDecisionReport(runs: BassRun[]): DecisionReport {
  const sortedRuns = [...runs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const placement = evaluatePlacementSection(sortedRuns);
  const phase = evaluatePhaseSection(sortedRuns);
  const scoutRanking = buildScoutRanking(sortedRuns.filter((run) => run.mode === "scout"));

  const overallScore = clamp(
    phase.available
      ? Math.round(placement.confidenceScore * 0.7 + phase.confidenceScore * 0.3)
      : placement.confidenceScore,
    0,
    100
  );
  const overallConfidence = confidenceTierFromScore(overallScore);

  const summaryParts: string[] = [];

  if (placement.winner && phase.winner) {
    summaryParts.push(`Recommended setup: ${placement.winner} with ${phase.winner}.`);
  } else if (placement.winner) {
    summaryParts.push(`Recommended placement: ${placement.winner}.`);
    summaryParts.push("Phase recommendation still needs confirmation.");
  } else {
    summaryParts.push("No final placement winner yet.");
  }

  if (!phase.available) {
    summaryParts.push("Phase test has not been completed.");
  } else if (!phase.winner) {
    summaryParts.push("Phase runs exist, but confidence is not high enough to lock a setting.");
  }

  summaryParts.push(`Overall confidence: ${overallConfidence.toUpperCase()} (${overallScore}/100).`);

  const nextActions = uniqueStrings([...placement.nextActions, ...phase.nextActions]).slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    overallConfidence,
    overallScore,
    summary: summaryParts.join(" "),
    nextActions,
    placement,
    phase,
    scout: {
      candidateCount: scoutRanking.candidates.length,
      topTwo: scoutRanking.topTwo ? [scoutRanking.topTwo[0].label, scoutRanking.topTwo[1].label] : []
    }
  };
}

export function reportPrintText(report: DecisionReport): string {
  const lines: string[] = [];
  lines.push("BassBuddy Final Decision Report");
  lines.push(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push(`Overall confidence: ${report.overallConfidence.toUpperCase()} (${report.overallScore}/100)`);
  lines.push("");
  lines.push(`Summary: ${report.summary}`);
  lines.push("");
  lines.push("Placement");
  lines.push(`Winner: ${report.placement.winner ?? "No winner yet"}`);
  lines.push(`Confidence: ${report.placement.confidence.toUpperCase()} (${report.placement.confidenceScore}/100)`);
  lines.push(`Rationale: ${report.placement.rationale}`);
  if (report.placement.blockers.length) {
    lines.push(`Blockers: ${report.placement.blockers.join(" | ")}`);
  }
  if (report.placement.warnings.length) {
    lines.push(`Warnings: ${report.placement.warnings.join(" | ")}`);
  }
  lines.push("");
  lines.push("Phase");
  lines.push(`Winner: ${report.phase.winner ?? "No winner yet"}`);
  lines.push(`Confidence: ${report.phase.confidence.toUpperCase()} (${report.phase.confidenceScore}/100)`);
  lines.push(`Rationale: ${report.phase.rationale}`);
  if (report.phase.blockers.length) {
    lines.push(`Blockers: ${report.phase.blockers.join(" | ")}`);
  }
  if (report.phase.warnings.length) {
    lines.push(`Warnings: ${report.phase.warnings.join(" | ")}`);
  }
  lines.push("");
  lines.push("Next Actions");
  for (const action of report.nextActions) {
    lines.push(`- ${action}`);
  }

  return lines.join("\n");
}

export function compareDecisionReports(
  previous: DecisionReport,
  current: DecisionReport
): DecisionReportDelta {
  return {
    overallScoreDelta: current.overallScore - previous.overallScore,
    overallConfidenceChanged: current.overallConfidence !== previous.overallConfidence,
    placementWinnerChanged: current.placement.winner !== previous.placement.winner,
    phaseWinnerChanged: current.phase.winner !== previous.phase.winner
  };
}
