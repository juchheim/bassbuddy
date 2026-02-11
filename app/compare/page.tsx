"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ResetRunsButton } from "@/components/ResetRunsButton";
import { ResponseChart } from "@/components/ResponseChart";
import { RunPicker } from "@/components/RunPicker";
import {
  getActiveExperimentSessionId,
  listExperimentSessions,
  setActiveExperimentSession,
  type ExperimentSession
} from "@/lib/storage/experimentSessions";
import { startGuidedSession } from "@/lib/storage/guidedSession";
import { deleteRun, listRuns } from "@/lib/storage/runsStore";
import { getWinnerLock, saveWinnerLock } from "@/lib/storage/winnerLock";
import type { BassRun, RunMode } from "@/lib/types";
import { MULTI_SEAT_ORDER, seatDisplayName } from "@/lib/constants/multiSeat";
import { compareRuns } from "@/lib/utils/compareRuns";
import { buildMultiSeatRunSet, evaluateMultiSeatDecision } from "@/lib/utils/multiSeat";
import { modeTitle, normalizeMode } from "@/lib/utils/mode";
import {
  buildRepeatabilityProfile,
  curveDeltaBetweenRuns,
  evaluateRepeatabilityDecision,
  groupRunsByLabel,
  isRepeatabilityModeRecommended
} from "@/lib/utils/repeatability";
import { buildScoutRanking, scoutPromotionLabels } from "@/lib/utils/scout";
import { evaluateCompareReadiness, evaluateRunGroupVolumeConsistency } from "@/lib/utils/runQuality";
import styles from "@/app/compare/compare.module.css";

type CompareStrategy = "single" | "repeatability";
type LockKind = "placement" | "phase";

interface LockCandidate {
  kind: LockKind;
  winner: string;
}

function recommendationText(runA: BassRun, runB: BassRun) {
  const decision = compareRuns(runA, runB);

  if (decision.winnerId === "tie") {
    return {
      headline: "Tie: both runs are effectively equivalent.",
      detail: decision.reason
    };
  }

  const winner = decision.winnerId === runA.id ? runA : runB;
  const loser = decision.winnerId === runA.id ? runB : runA;
  const winnerLabel = winner.label ?? (winner.id === runA.id ? "A" : "B");

  let detail = `${winnerLabel} wins: less boom at ~${winner.highlights.worstPeakHz} Hz`;

  if (winner.highlights.deepDipCount < loser.highlights.deepDipCount) {
    detail += " and fewer deep dips.";
  } else {
    detail += ".";
  }

  const nextSuggestions: string[] = [];

  if (winner.highlights.maxPeakDb > 6) {
    nextSuggestions.push("Try moving the sub farther from corners to reduce boundary loading peaks.");
  }

  if (winner.highlights.maxDipDb < -10) {
    nextSuggestions.push("Try moving the sub 1-2 ft; deep dips are often cancellations.");
  }

  if (!nextSuggestions.length) {
    nextSuggestions.push("Current winner already looks relatively smooth for this MVP method.");
  }

  return {
    headline: detail,
    detail: `${decision.reason} ${nextSuggestions.join(" ")}`
  };
}

export default function ComparePage() {
  const router = useRouter();
  const [mode, setMode] = useState<RunMode>("ab");
  const [sessions, setSessions] = useState<ExperimentSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [runs, setRuns] = useState<BassRun[]>([]);
  const [selectedA, setSelectedA] = useState("");
  const [selectedB, setSelectedB] = useState("");
  const [selectedGroupA, setSelectedGroupA] = useState("");
  const [selectedGroupB, setSelectedGroupB] = useState("");
  const [strategy, setStrategy] = useState<CompareStrategy>("single");
  const [notice, setNotice] = useState<string | null>(null);
  const [lockNote, setLockNote] = useState("");
  const [lockRefreshTick, setLockRefreshTick] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextMode = normalizeMode(params.get("mode"));
    const requestedSessionId = params.get("session");
    const availableSessions = listExperimentSessions();
    setSessions(availableSessions);

    const fallbackSessionId = getActiveExperimentSessionId();
    const resolvedSessionId =
      requestedSessionId && availableSessions.some((session) => session.id === requestedSessionId)
        ? requestedSessionId
        : fallbackSessionId;

    if (resolvedSessionId) {
      setActiveExperimentSession(resolvedSessionId);
      setActiveSessionId(resolvedSessionId);
    }

    setMode(nextMode);
    if (nextMode === "multiseat" || nextMode === "scout") {
      setStrategy("single");
      return;
    }

    setStrategy(isRepeatabilityModeRecommended(nextMode) ? "repeatability" : "single");
  }, []);

  useEffect(() => {
    const nextRuns = listRuns(mode, activeSessionId || undefined);
    setRuns(nextRuns);

    const first = nextRuns[0]?.id ?? "";
    const second = nextRuns[1]?.id ?? first;
    setSelectedA(first);
    setSelectedB(second);
  }, [activeSessionId, mode]);

  useEffect(() => {
    if (mode === "multiseat" || mode === "scout") {
      setStrategy("single");
      return;
    }

    if (!isRepeatabilityModeRecommended(mode) && strategy === "repeatability") {
      setStrategy("single");
    }
  }, [mode, strategy]);

  const runA = useMemo(() => runs.find((run) => run.id === selectedA), [runs, selectedA]);
  const runB = useMemo(() => runs.find((run) => run.id === selectedB), [runs, selectedB]);
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );
  const activeWinnerLock = useMemo(
    () => (activeSessionId ? getWinnerLock(activeSessionId) : null),
    [activeSessionId, lockRefreshTick]
  );

  const groups = useMemo(() => groupRunsByLabel(runs), [runs]);

  useEffect(() => {
    const first = groups[0]?.label ?? "";
    const second = groups[1]?.label ?? first;

    setSelectedGroupA((prev) => (groups.some((group) => group.label === prev) ? prev : first));
    setSelectedGroupB((prev) => (groups.some((group) => group.label === prev) ? prev : second));
  }, [groups]);

  const profileA = useMemo(() => {
    if (strategy !== "repeatability") {
      return null;
    }

    const group = groups.find((entry) => entry.label === selectedGroupA);
    return group ? buildRepeatabilityProfile(group.label, group.runs, 3) : null;
  }, [groups, selectedGroupA, strategy]);

  const profileB = useMemo(() => {
    if (strategy !== "repeatability") {
      return null;
    }

    const group = groups.find((entry) => entry.label === selectedGroupB);
    return group ? buildRepeatabilityProfile(group.label, group.runs, 3) : null;
  }, [groups, selectedGroupB, strategy]);

  const multiSeatDecision = useMemo(() => {
    if (mode !== "multiseat") {
      return null;
    }

    return evaluateMultiSeatDecision(runs);
  }, [mode, runs]);

  const multiSeatRunSet = useMemo(() => {
    if (mode !== "multiseat") {
      return null;
    }

    return buildMultiSeatRunSet(runs);
  }, [mode, runs]);

  const scoutRanking = useMemo(() => {
    if (mode !== "scout") {
      return null;
    }

    return buildScoutRanking(runs);
  }, [mode, runs]);

  const scoutVolumeConsistency = useMemo(() => {
    if (mode !== "scout" || !scoutRanking) {
      return null;
    }

    return evaluateRunGroupVolumeConsistency(scoutRanking.candidates.map((candidate) => candidate.run));
  }, [mode, scoutRanking]);

  const scoutBlockers: string[] = [];
  const scoutWarnings: string[] = [];

  if (mode === "scout") {
    const candidateCount = scoutRanking?.candidates.length ?? 0;
    const topTwoIds = new Set((scoutRanking?.topTwo ?? []).map((entry) => entry.run.id));

    if (candidateCount < 4) {
      scoutBlockers.push("Capture at least 4 scout candidate locations before ranking.");
    }

    for (const candidate of scoutRanking?.candidates ?? []) {
      if (candidate.run.quality?.blocking) {
        if (topTwoIds.has(candidate.run.id)) {
          scoutBlockers.push(`${candidate.label} failed quality checks (${candidate.run.quality.score}/100).`);
        } else {
          scoutWarnings.push(`${candidate.label} failed quality checks; recapture if you want it considered.`);
        }
      } else if (candidate.run.quality?.tier === "usable") {
        scoutWarnings.push(`${candidate.label} is only usable quality (${candidate.run.quality.score}/100).`);
      } else if (!candidate.run.quality) {
        scoutWarnings.push(`${candidate.label} is a legacy run without quality metadata.`);
      }
    }

    if (scoutVolumeConsistency?.severity === "block") {
      scoutBlockers.push(
        `Scout run volume drift is too high (max ${scoutVolumeConsistency.maxDeltaDb.toFixed(1)} dB vs session median).`
      );
    } else if (scoutVolumeConsistency?.severity === "warn") {
      scoutWarnings.push(
        `Scout run volume drift warning (max ${scoutVolumeConsistency.maxDeltaDb.toFixed(1)} dB vs session median).`
      );
    }
  }

  const activeRunA =
    mode === "scout"
      ? scoutRanking?.topTwo?.[0].run
      : mode === "multiseat"
      ? multiSeatDecision?.placementA.aggregateRun
      : strategy === "repeatability"
      ? profileA?.aggregateRun
      : runA;
  const activeRunB =
    mode === "scout"
      ? scoutRanking?.topTwo?.[1].run
      : mode === "multiseat"
      ? multiSeatDecision?.placementB.aggregateRun
      : strategy === "repeatability"
      ? profileB?.aggregateRun
      : runB;

  const recommendation =
    activeRunA && activeRunB && activeRunA.id !== activeRunB.id ? recommendationText(activeRunA, activeRunB) : null;
  const compareDecision =
    activeRunA && activeRunB && activeRunA.id !== activeRunB.id ? compareRuns(activeRunA, activeRunB) : null;

  const compareReadiness =
    activeRunA && activeRunB && activeRunA.id !== activeRunB.id ? evaluateCompareReadiness(activeRunA, activeRunB) : null;

  const repeatabilityDecision =
    strategy === "repeatability" && profileA && profileB ? evaluateRepeatabilityDecision(profileA, profileB) : null;

  const repeatabilityCurveDelta =
    strategy === "repeatability" && activeRunA && activeRunB ? curveDeltaBetweenRuns(activeRunA, activeRunB) : null;

  const repeatabilityBlockers: string[] = [];

  if (strategy === "repeatability") {
    if (!selectedGroupA || !selectedGroupB) {
      repeatabilityBlockers.push("Select two groups to compare.");
    }

    if (selectedGroupA === selectedGroupB && selectedGroupA) {
      repeatabilityBlockers.push("Choose different groups for A and B.");
    }

    if (!profileA) {
      repeatabilityBlockers.push("Group A needs at least 2 runs (latest 2-3 recommended).");
    }

    if (!profileB) {
      repeatabilityBlockers.push("Group B needs at least 2 runs (latest 2-3 recommended).");
    }

    if (repeatabilityDecision && !repeatabilityDecision.canDeclareWinner) {
      repeatabilityBlockers.push(`Repeatability gate: ${repeatabilityDecision.reason}`);
    }
  }

  const canDeclareWinner =
    mode === "scout"
      ? Boolean(compareReadiness?.canDeclareWinner) && scoutBlockers.length === 0
      : mode === "multiseat"
      ? Boolean(compareReadiness?.canDeclareWinner) && Boolean(multiSeatDecision?.canDeclareWinner)
      : Boolean(compareReadiness?.canDeclareWinner) &&
        (strategy !== "repeatability" || repeatabilityBlockers.length === 0);

  const showComparisonSections =
    mode === "scout"
      ? Boolean(scoutRanking?.topTwo && activeRunA && activeRunB && activeRunA.id !== activeRunB.id)
      : mode === "multiseat"
      ? Boolean(multiSeatDecision)
      : Boolean(activeRunA && activeRunB && activeRunA.id !== activeRunB.id);

  const lockCandidate: LockCandidate | null = useMemo(() => {
    if (!canDeclareWinner || !activeSessionId) {
      return null;
    }

    if (mode === "multiseat" && multiSeatDecision && multiSeatDecision.winner !== "tie") {
      return {
        kind: "placement",
        winner: `Placement ${multiSeatDecision.winner}`
      };
    }

    if (!compareDecision || !activeRunA || !activeRunB || compareDecision.winnerId === "tie") {
      return null;
    }

    const winnerRun = compareDecision.winnerId === activeRunA.id ? activeRunA : activeRunB;
    const fallbackLabel = winnerRun.id === activeRunA.id ? "Run A" : "Run B";
    const winner = winnerRun.label?.trim() || fallbackLabel;

    if (mode === "phase") {
      return {
        kind: "phase",
        winner
      };
    }

    if (mode === "ab") {
      return {
        kind: "placement",
        winner
      };
    }

    return null;
  }, [activeRunA, activeRunB, activeSessionId, canDeclareWinner, compareDecision, mode, multiSeatDecision]);

  useEffect(() => {
    setLockNote(activeWinnerLock?.notes ?? "");
  }, [activeWinnerLock?.sessionId, activeWinnerLock?.updatedAt]);

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Compare Runs</h1>
        <p className="muted">Overlay measurements and choose the smoother result.</p>
      </header>

      <section className={`panel ${styles.controls}`}>
        <label>
          Experiment session
          <select
            value={activeSessionId}
            onChange={(event) => {
              const nextSessionId = event.target.value;

              if (!setActiveExperimentSession(nextSessionId)) {
                return;
              }

              setActiveSessionId(nextSessionId);
              setNotice("Switched active experiment session.");
            }}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Showing runs from: {activeSession?.name ?? "Active session"}
        </p>
        {activeWinnerLock ? (
          <div className={styles.lockSummary}>
            <p className="muted" style={{ margin: 0 }}>
              Locked placement baseline: <strong>{activeWinnerLock.placementWinner ?? "Not locked"}</strong>
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Locked phase baseline: <strong>{activeWinnerLock.phaseWinner ?? "Not locked"}</strong>
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Locked at: {new Date(activeWinnerLock.updatedAt).toLocaleString()}
            </p>
            {activeWinnerLock.notes ? (
              <p className="muted" style={{ margin: 0 }}>
                Notes: {activeWinnerLock.notes}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No baseline lock saved for this session yet.
          </p>
        )}

        <label>
          Compare mode
          <select value={mode} onChange={(event) => setMode(normalizeMode(event.target.value))}>
            <option value="ab">Compare Two Placements (A/B)</option>
            <option value="phase">Phase Test (0 vs 180)</option>
            <option value="multiseat">Multi-Seat Compromise (A/B)</option>
            <option value="scout">Placement Scout (4-8 Candidates)</option>
            <option value="baseline">Quick Baseline</option>
          </select>
        </label>
        <p className="muted">Current mode: {modeTitle(mode)}</p>

        {mode !== "multiseat" && mode !== "scout" ? (
          <label>
            Compare strategy
            <select value={strategy} onChange={(event) => setStrategy(event.target.value as CompareStrategy)}>
              <option value="single">Single-run compare</option>
              <option value="repeatability">Repeatability mode (2-3 runs per side)</option>
            </select>
          </label>
        ) : mode === "scout" ? (
          <p className="muted" style={{ margin: 0 }}>
            Placement Scout ranks candidate locations by smoothness first, then deep dips and boom peaks.
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Multi-seat mode compares A vs B compromise across Center/Left/Right seat captures.
          </p>
        )}

        {mode === "scout" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Capture at least 4 labeled scout locations. The latest run per location is ranked.
            </p>
            {scoutRanking?.candidates.length ? (
              <div className={styles.scoutGrid}>
                {scoutRanking.candidates.map((candidate) => (
                  <div key={candidate.run.id} className={styles.scoutCard}>
                    <p className={styles.seatTitle}>
                      #{candidate.rank} {candidate.label}
                    </p>
                    <p className="muted" style={{ margin: 0 }}>
                      Smoothness {candidate.run.score.toFixed(1)} | Deep dips {candidate.run.highlights.deepDipCount} | Peak{" "}
                      {candidate.run.highlights.maxPeakDb.toFixed(1)} dB
                    </p>
                    {typeof candidate.run.volumeDriftDb === "number" ? (
                      <p className="muted" style={{ margin: 0 }}>
                        Session volume drift: {candidate.run.volumeDriftDb.toFixed(1)} dB
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="warning" style={{ margin: 0 }}>
                No scout runs found yet. Start a scout session from Setup.
              </p>
            )}
            {scoutRanking?.topTwo && scoutRanking.candidates.length >= 4 ? (
              <button
                type="button"
                className="cta"
                onClick={() => {
                  const finalists = scoutRanking?.topTwo;

                  if (!finalists) {
                    setNotice("Top scout finalists are not available yet.");
                    return;
                  }

                  if (
                    !window.confirm(
                      `Start guided A/B compare with ${finalists[0].label} vs ${finalists[1].label}?`
                    )
                  ) {
                    return;
                  }

                  const labels = scoutPromotionLabels(finalists);
                  startGuidedSession("ab", 2, { labelOverrides: labels });
                  setNotice(`Started guided A/B compare: ${labels.A} vs ${labels.B}.`);
                  router.push("/record?mode=ab");
                }}
              >
                Promote Top 2 Into Guided A/B Compare
              </button>
            ) : scoutRanking?.topTwo ? (
              <p className="warning" style={{ margin: 0 }}>
                Capture at least 4 candidate locations before promoting finalists.
              </p>
            ) : null}
          </>
        ) : mode === "multiseat" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Required labels: Placement A/B for Center, Left, and Right seats.
            </p>
            {multiSeatRunSet ? (
              <div className={styles.seatGrid}>
                {MULTI_SEAT_ORDER.map((seat) => {
                  const runASeat = multiSeatRunSet.placementA[seat];
                  const runBSeat = multiSeatRunSet.placementB[seat];

                  return (
                    <div key={seat} className={styles.seatCard}>
                      <p className={styles.seatTitle}>{seatDisplayName(seat)}</p>
                      <p className="muted" style={{ margin: 0 }}>
                        A: {runASeat ? `score ${runASeat.score.toFixed(1)}` : "missing"}
                      </p>
                      <p className="muted" style={{ margin: 0 }}>
                        B: {runBSeat ? `score ${runBSeat.score.toFixed(1)}` : "missing"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : strategy === "repeatability" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Repeatability mode compares median curves from each group and only declares a winner if advantage exceeds
              the measured repeatability floor.
            </p>
            <label>
              Group A label
              <select value={selectedGroupA} onChange={(event) => setSelectedGroupA(event.target.value)}>
                {groups.map((group) => (
                  <option value={group.label} key={`group-a-${group.label}`}>
                    {group.label} ({group.runs.length} run{group.runs.length === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Group B label
              <select value={selectedGroupB} onChange={(event) => setSelectedGroupB(event.target.value)}>
                {groups.map((group) => (
                  <option value={group.label} key={`group-b-${group.label}`}>
                    {group.label} ({group.runs.length} run{group.runs.length === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : runs.length >= 2 ? (
          <>
            <RunPicker id="runA" label="Run A" runs={runs} selectedId={selectedA} onSelect={setSelectedA} />
            <RunPicker id="runB" label="Run B" runs={runs} selectedId={selectedB} onSelect={setSelectedB} />
            <div className={styles.rowActions}>
              <button
                type="button"
                className="cta ctaSecondary"
                disabled={!selectedA}
                onClick={() => {
                  const run = runs.find((entry) => entry.id === selectedA);
                  if (!run) {
                    setNotice("Run A was not found.");
                    return;
                  }

                  if (!window.confirm(`Delete "${run.label ?? "Run A"}"?`)) {
                    return;
                  }

                  const removed = deleteRun(run.id);
                  if (removed) {
                    setNotice("Deleted selected Run A.");
                    const nextRuns = listRuns(mode, activeSessionId || undefined);
                    setRuns(nextRuns);
                    setSelectedA(nextRuns[0]?.id ?? "");
                    setSelectedB(nextRuns[1]?.id ?? nextRuns[0]?.id ?? "");
                  } else {
                    setNotice("Could not delete selected Run A.");
                  }
                }}
              >
                Delete Selected Run A
              </button>
              <button
                type="button"
                className="cta ctaSecondary"
                disabled={!selectedB}
                onClick={() => {
                  const run = runs.find((entry) => entry.id === selectedB);
                  if (!run) {
                    setNotice("Run B was not found.");
                    return;
                  }

                  if (!window.confirm(`Delete "${run.label ?? "Run B"}"?`)) {
                    return;
                  }

                  const removed = deleteRun(run.id);
                  if (removed) {
                    setNotice("Deleted selected Run B.");
                    const nextRuns = listRuns(mode, activeSessionId || undefined);
                    setRuns(nextRuns);
                    setSelectedA(nextRuns[0]?.id ?? "");
                    setSelectedB(nextRuns[1]?.id ?? nextRuns[0]?.id ?? "");
                  } else {
                    setNotice("Could not delete selected Run B.");
                  }
                }}
              >
                Delete Selected Run B
              </button>
            </div>
          </>
        ) : (
          <p className="warning">Need at least two saved runs in this mode to compare.</p>
        )}

        <ResetRunsButton
          mode={mode}
          sessionId={activeSessionId || undefined}
          className="cta ctaDanger"
          label="Start Fresh (Delete Runs In This Mode)"
          onCleared={() => {
            const nextSessionRuns = listRuns(mode, activeSessionId || undefined);
            setRuns(nextSessionRuns);
            setSelectedA(nextSessionRuns[0]?.id ?? "");
            setSelectedB(nextSessionRuns[1]?.id ?? nextSessionRuns[0]?.id ?? "");
            setNotice("Deleted runs in this mode.");
          }}
        />
        {notice ? <p className="muted" style={{ margin: 0 }}>{notice}</p> : null}
      </section>

      {showComparisonSections ? (
        <>
          {compareReadiness || multiSeatDecision || mode === "scout" ? (
            <section className={`panel ${styles.qualityPanel}`} style={{ marginTop: 12 }}>
              <h2>Measurement Quality Gate</h2>
              {compareReadiness?.blockers.length ? (
                compareReadiness.blockers.map((blocker) => (
                  <p key={blocker} className="error" style={{ margin: 0 }}>
                    {blocker}
                  </p>
                ))
              ) : compareReadiness ? (
                <p className="ok" style={{ margin: 0 }}>
                  Quality gate passed.
                </p>
              ) : null}

              {compareReadiness?.warnings.map((warning) => (
                <p key={warning} className="warning" style={{ margin: 0 }}>
                  {warning}
                </p>
              ))}

              {mode === "scout" ? (
                <>
                  {scoutBlockers.map((blocker) => (
                    <p key={blocker} className="error" style={{ margin: 0 }}>
                      {blocker}
                    </p>
                  ))}
                  {scoutWarnings.map((warning) => (
                    <p key={warning} className="warning" style={{ margin: 0 }}>
                      {warning}
                    </p>
                  ))}
                  {scoutVolumeConsistency ? (
                    <p className="muted" style={{ marginBottom: 0 }}>
                      Scout volume consistency: reference {scoutVolumeConsistency.referenceDb.toFixed(1)} dB, max delta{" "}
                      {scoutVolumeConsistency.maxDeltaDb.toFixed(1)} dB.
                    </p>
                  ) : null}
                </>
              ) : mode === "multiseat" ? (
                <>
                  {multiSeatDecision?.blockers.map((blocker) => (
                    <p key={blocker} className="error" style={{ margin: 0 }}>
                      {blocker}
                    </p>
                  ))}
                  {multiSeatDecision?.warnings.map((warning) => (
                    <p key={warning} className="warning" style={{ margin: 0 }}>
                      {warning}
                    </p>
                  ))}
                  {multiSeatDecision ? (
                    <p className="muted" style={{ marginBottom: 0 }}>
                      Compromise scores: A {multiSeatDecision.placementA.compromiseScore.toFixed(1)} vs B{" "}
                      {multiSeatDecision.placementB.compromiseScore.toFixed(1)}. Decision floor:{" "}
                      {multiSeatDecision.scoreFloor.toFixed(1)}. Delta: {multiSeatDecision.scoreDelta.toFixed(1)}.
                    </p>
                  ) : null}
                </>
              ) : strategy === "repeatability" ? (
                <>
                  {repeatabilityBlockers.map((blocker) => (
                    <p key={blocker} className="warning" style={{ margin: 0 }}>
                      {blocker}
                    </p>
                  ))}
                  {profileA && profileB ? (
                    <p className="muted" style={{ marginBottom: 0 }}>
                      Group A ({profileA.label}): {profileA.sourceRuns.length} runs, score spread {profileA.scoreSpread.toFixed(1)},
                      curve noise floor {profileA.curveNoiseFloorDb.toFixed(2)} dB. Group B ({profileB.label}): {" "}
                      {profileB.sourceRuns.length} runs, score spread {profileB.scoreSpread.toFixed(1)}, curve noise floor {" "}
                      {profileB.curveNoiseFloorDb.toFixed(2)} dB. Inter-group median curve delta: {" "}
                      {repeatabilityCurveDelta?.toFixed(2)} dB.
                    </p>
                  ) : null}
                </>
              ) : compareReadiness?.repeatability ? (
                <p className="muted" style={{ marginBottom: 0 }}>
                  Repeatability signal: {compareReadiness.repeatability.verdict} (mean difference{" "}
                  {compareReadiness.repeatability.meanAbsDiffDb.toFixed(2)} dB, max{" "}
                  {compareReadiness.repeatability.maxAbsDiffDb.toFixed(2)} dB).
                </p>
              ) : null}
            </section>
          ) : null}

          {activeRunA && activeRunB && activeRunA.id !== activeRunB.id ? (
            <section className="panel" style={{ marginTop: 12 }}>
              <ResponseChart
                series={[
                  {
                    id: activeRunA.id,
                    name:
                      strategy === "repeatability" && profileA
                        ? `${profileA.label} median (n=${profileA.sourceRuns.length})`
                        : activeRunA.label ?? "Run A",
                    color: "var(--series-a)",
                    measurements: activeRunA.measurements
                  },
                  {
                    id: activeRunB.id,
                    name:
                      strategy === "repeatability" && profileB
                        ? `${profileB.label} median (n=${profileB.sourceRuns.length})`
                        : activeRunB.label ?? "Run B",
                    color: "var(--series-b)",
                    measurements: activeRunB.measurements
                  }
                ]}
              />
            </section>
          ) : null}

          {recommendation || mode === "multiseat" || mode === "scout" ? (
            <section className="panel" style={{ marginTop: 12 }}>
              <h2>Recommendation</h2>
              {canDeclareWinner ? (
                mode === "multiseat" && multiSeatDecision ? (
                  <>
                    <p className={styles.recommendation}>
                      {multiSeatDecision.winner === "tie"
                        ? "Tie: neither placement clearly beats the compromise floor."
                        : `Placement ${multiSeatDecision.winner} wins compromise across seats.`}
                    </p>
                    <p className="muted">{multiSeatDecision.reason}</p>
                  </>
                ) : mode === "scout" && scoutRanking?.topTwo ? (
                  <>
                    <p className={styles.recommendation}>
                      Best scout candidates: {scoutRanking.topTwo[0].label} and {scoutRanking.topTwo[1].label}.
                    </p>
                    <p className="muted">
                      Promote these two into guided A/B at the listening seat to confirm the final winner.
                    </p>
                  </>
                ) : recommendation ? (
                  <>
                    <p className={styles.recommendation}>{recommendation.headline}</p>
                    <p className="muted">{recommendation.detail}</p>
                  </>
                ) : (
                  <p className="warning" style={{ marginBottom: 0 }}>
                    Not enough run quality to declare a winner yet.
                  </p>
                )
              ) : (
                <p className="warning" style={{ marginBottom: 0 }}>
                  Winner recommendation withheld until quality and repeatability gates pass.
                </p>
              )}

              {lockCandidate ? (
                <div className={styles.lockControls}>
                  <label>
                    Baseline lock notes (optional)
                    <input
                      type="text"
                      value={lockNote}
                      placeholder="e.g. Confirmed after 3 repeatability runs"
                      onChange={(event) => setLockNote(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="cta ctaSecondary"
                    onClick={() => {
                      const saved = saveWinnerLock({
                        sessionId: activeSessionId,
                        placementWinner: lockCandidate.kind === "placement" ? lockCandidate.winner : undefined,
                        phaseWinner: lockCandidate.kind === "phase" ? lockCandidate.winner : undefined,
                        notes: lockNote,
                        source: "compare"
                      });

                      if (!saved) {
                        setNotice("No winner available to lock yet.");
                        return;
                      }

                      setLockRefreshTick((value) => value + 1);
                      setNotice(
                        `Locked ${lockCandidate.kind} baseline as "${lockCandidate.winner}" for session "${activeSession?.name ?? "active"}".`
                      );
                    }}
                  >
                    Lock {lockCandidate.kind === "phase" ? "Phase" : "Placement"} Winner
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      <section style={{ marginTop: 12 }}>
        <div className={styles.rowActions}>
          <Link href={`/record?mode=${mode}`} className="cta" style={{ textAlign: "center" }}>
            Run Another Measurement
          </Link>
          <Link href="/decision" className="cta ctaSecondary" style={{ textAlign: "center" }}>
            Open Final Decision Assistant
          </Link>
        </div>
      </section>
    </main>
  );
}
