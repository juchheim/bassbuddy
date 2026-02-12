"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoomMapCanvas, buildHeatmap } from "@/components/placementMap/RoomMapCanvas";
import { DEFAULT_PLACEMENT_BANDS } from "@/lib/placementMap/bands";
import { computeCoverageSummary } from "@/lib/placementMap/heatmap";
import { startPlacementMeasurementRequest } from "@/lib/placementMap/measurementBridge";
import {
  addCandidatePoint,
  createPlacementSession,
  deleteCandidatePoint,
  deletePlacementSession,
  exportPlacementSessionPayload,
  getActivePlacementSessionId,
  getLatestMeasurementForPoint,
  listPlacementSessions,
  renamePlacementSession,
  setActivePlacementSession,
  setPlacementListeningPosition,
  updateCandidatePoint,
  updatePlacementRoom
} from "@/lib/placementMap/store";
import type { PlacementMapSession } from "@/lib/placementMap/types";
import styles from "@/app/placement-map/placement-map.module.css";

interface MetricOption {
  key: string;
  label: string;
}

interface PointSummary {
  id: string;
  label: string;
  x: number;
  y: number;
  score: number | null;
  overallScore: number | null;
  measuredRuns: number;
  qualityFlags: {
    clipped?: boolean;
    noisy?: boolean;
    unstable?: boolean;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatScore(score: number | null): string {
  return score === null ? "Unmeasured" : `${score.toFixed(1)}`;
}

function exportFilename(sessionName: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const clean = sessionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  return `${clean || "placement"}-session-${yyyy}${mm}${dd}.json`;
}

function loadPlacementState(): { sessions: PlacementMapSession[]; activeSessionId: string } {
  const sessions = listPlacementSessions();
  const activeSessionId = getActivePlacementSessionId();

  return {
    sessions,
    activeSessionId
  };
}

export default function PlacementMapPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PlacementMapSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [selectedPointId, setSelectedPointId] = useState<string>("");
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomWidthDraft, setRoomWidthDraft] = useState("");
  const [roomHeightDraft, setRoomHeightDraft] = useState("");
  const [pointLabelDraft, setPointLabelDraft] = useState("");
  const [metricKey, setMetricKey] = useState<string>("overall");
  const [setListeningMode, setSetListeningMode] = useState(false);
  const [measurementRunId, setMeasurementRunId] = useState<string>("");
  const [notice, setNotice] = useState<{ kind: "info" | "warn"; text: string } | null>(null);

  const refreshSessions = useCallback((preferredSessionId?: string) => {
    if (preferredSessionId) {
      setActivePlacementSession(preferredSessionId);
    }

    const state = loadPlacementState();
    setSessions(state.sessions);
    setActiveSessionId(state.activeSessionId);

    setSelectedPointId((current) => {
      const activeSession = state.sessions.find((entry) => entry.id === state.activeSessionId);

      if (!activeSession) {
        return "";
      }

      return activeSession.candidatePoints.some((entry) => entry.id === current) ? current : "";
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSessionId = params.get("session") ?? "";
    const requestedPointId = params.get("point") ?? "";
    const returnedRunId = params.get("pmr") ?? "";

    refreshSessions(requestedSessionId || undefined);

    if (requestedPointId) {
      setSelectedPointId(requestedPointId);
    }

    if (returnedRunId) {
      setMeasurementRunId(returnedRunId);
    }

    const handleRefresh = () => refreshSessions();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleRefresh();
      }
    };

    window.addEventListener("focus", handleRefresh);
    window.addEventListener("storage", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("storage", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshSessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions]
  );

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    setSessionNameDraft(activeSession.name);
    setRoomNameDraft(activeSession.room.name);
    setRoomWidthDraft(String(activeSession.room.width));
    setRoomHeightDraft(String(activeSession.room.height));
  }, [activeSessionId, activeSession]);

  const metricOptions = useMemo<MetricOption[]>(() => {
    const defaults: MetricOption[] = [{ key: "overall", label: "Overall Score" }];

    for (const band of DEFAULT_PLACEMENT_BANDS) {
      defaults.push({
        key: band.key,
        label: band.label
      });
    }

    // TODO: Add richer user-defined band presets after validating v1 workflows.
    return defaults;
  }, []);

  const pointSummaries = useMemo<PointSummary[]>(() => {
    if (!activeSession) {
      return [];
    }

    return activeSession.candidatePoints.map((point) => {
      const runsForPoint = activeSession.measurementRuns.filter((run) => run.pointId === point.id);
      const latestRun = getLatestMeasurementForPoint(activeSession, point.id);

      const score =
        metricKey === "overall"
          ? latestRun?.overallScore ?? null
          : typeof latestRun?.bandScores[metricKey] === "number"
          ? latestRun.bandScores[metricKey]
          : null;

      return {
        id: point.id,
        label: point.label,
        x: point.x,
        y: point.y,
        score,
        overallScore: latestRun?.overallScore ?? null,
        measuredRuns: runsForPoint.length,
        qualityFlags: latestRun?.qualityFlags ?? {}
      };
    });
  }, [activeSession, metricKey]);

  const sortedPoints = useMemo(() => {
    return [...pointSummaries].sort((a, b) => {
      if (a.score !== null && b.score === null) {
        return -1;
      }

      if (a.score === null && b.score !== null) {
        return 1;
      }

      if (a.score !== null && b.score !== null && a.score !== b.score) {
        return b.score - a.score;
      }

      return a.label.localeCompare(b.label);
    });
  }, [pointSummaries]);

  const topPlacements = useMemo(() => {
    return [...pointSummaries]
      .filter((entry) => entry.overallScore !== null)
      .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
      .slice(0, 3);
  }, [pointSummaries]);

  const measuredHeatmapPoints = useMemo(() => {
    return pointSummaries
      .filter((point) => point.score !== null)
      .map((point) => ({
        id: point.id,
        x: point.x,
        y: point.y,
        value: point.score ?? 0
      }));
  }, [pointSummaries]);

  const heatmap = useMemo(() => {
    if (!activeSession) {
      return null;
    }

    return buildHeatmap(activeSession.room.width, activeSession.room.height, measuredHeatmapPoints);
  }, [activeSession, measuredHeatmapPoints]);

  const coverage = useMemo(() => {
    if (!activeSession) {
      return {
        level: "low" as const,
        score: 0,
        measuredCount: 0,
        averageNearestDistance: 0,
        normalizedSpacing: 1
      };
    }

    const measuredCoordinates = pointSummaries
      .filter((entry) => entry.overallScore !== null)
      .map((entry) => ({ x: entry.x, y: entry.y }));

    return computeCoverageSummary(activeSession.room.width, activeSession.room.height, measuredCoordinates);
  }, [activeSession, pointSummaries]);

  const worstBandWarning = useMemo(() => {
    if (!activeSession?.measurementRuns.length) {
      return null;
    }

    const aggregates = new Map<string, { total: number; count: number }>();

    for (const run of activeSession.measurementRuns) {
      for (const band of DEFAULT_PLACEMENT_BANDS) {
        const score = run.bandScores[band.key];

        if (typeof score !== "number" || !Number.isFinite(score)) {
          continue;
        }

        const previous = aggregates.get(band.key) ?? { total: 0, count: 0 };
        aggregates.set(band.key, {
          total: previous.total + score,
          count: previous.count + 1
        });
      }
    }

    const averaged = DEFAULT_PLACEMENT_BANDS.map((band) => {
      const entry = aggregates.get(band.key);
      const average = entry && entry.count > 0 ? entry.total / entry.count : null;

      return {
        key: band.key,
        label: band.label,
        average
      };
    }).filter((entry): entry is { key: string; label: string; average: number } => entry.average !== null);

    if (!averaged.length) {
      return null;
    }

    const worst = [...averaged].sort((a, b) => a.average - b.average)[0];

    if (worst.average >= 68) {
      return null;
    }

    return worst;
  }, [activeSession]);

  const selectedPoint = useMemo(
    () => pointSummaries.find((point) => point.id === selectedPointId) ?? null,
    [pointSummaries, selectedPointId]
  );

  useEffect(() => {
    if (!selectedPoint) {
      setPointLabelDraft("");
      return;
    }

    setPointLabelDraft(selectedPoint.label);
  }, [selectedPoint]);

  useEffect(() => {
    if (!measurementRunId || !activeSession) {
      return;
    }

    const run = activeSession.measurementRuns.find((entry) => entry.id === measurementRunId);

    if (!run) {
      setMeasurementRunId("");
      return;
    }

    const point = activeSession.candidatePoints.find((entry) => entry.id === run.pointId);
    const hasFlags = Boolean(run.qualityFlags.clipped || run.qualityFlags.noisy || run.qualityFlags.unstable);

    if (hasFlags) {
      setNotice({
        kind: "warn",
        text: `${point?.label ?? "Point"} captured with quality warnings. Retake recommended before deciding.`
      });
    } else {
      setNotice({
        kind: "info",
        text: `${point?.label ?? "Point"} captured successfully. Heatmap and ranking updated.`
      });
    }

    setMeasurementRunId("");
  }, [activeSession, measurementRunId]);

  if (!activeSession) {
    return (
      <main className="pageContainer">
        <h1>Placement Map</h1>
        <p className="muted">Loading sessions...</p>
      </main>
    );
  }

  const runMeasurementForPoint = (pointId: string, pointLabel: string) => {
    const returnHref = `/placement-map?session=${encodeURIComponent(activeSession.id)}&point=${encodeURIComponent(pointId)}`;

    startPlacementMeasurementRequest({
      sessionId: activeSession.id,
      pointId,
      pointLabel,
      returnHref
    });

    router.push("/record?mode=baseline&placement=1");
  };

  const addSuggestedPoint = () => {
    const index = activeSession.candidatePoints.length;
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = clamp(activeSession.room.width * (0.2 + col * 0.3), activeSession.room.width * 0.08, activeSession.room.width * 0.92);
    const y = clamp(
      activeSession.room.height * (0.28 + row * 0.25),
      activeSession.room.height * 0.08,
      activeSession.room.height * 0.92
    );
    const created = addCandidatePoint(activeSession.id, { x, y });

    if (created) {
      setSelectedPointId(created.id);
      refreshSessions(activeSession.id);
    }
  };

  return (
    <main className="pageContainer">
      <header className={styles.header}>
        <h1>Placement Session</h1>
        <p className="muted" style={{ margin: 0 }}>
          Draw realistic candidate sub locations and interpolate quality trends between measured points. This is a guide,
          not a full-room physics simulation.
        </p>
      </header>

      <div className={styles.layout}>
        <section className="panel">
          <h2 className={styles.panelTitle}>Placement Sessions</h2>
          <div className={styles.sessionGrid} style={{ marginTop: 8 }}>
            {sessions.map((session) => (
              <div key={session.id} className={styles.sessionRow}>
                <button
                  type="button"
                  className={`${styles.sessionButton} ${session.id === activeSession.id ? styles.sessionButtonActive : ""}`}
                  onClick={() => {
                    setActivePlacementSession(session.id);
                    refreshSessions(session.id);
                    setNotice(null);
                  }}
                >
                  {session.name}
                </button>
                {sessions.length > 1 ? (
                  <button
                    type="button"
                    className="cta ctaDanger"
                    style={{ width: "auto", padding: "8px 10px" }}
                    onClick={() => {
                      if (!window.confirm(`Delete placement session \"${session.name}\"?`)) {
                        return;
                      }

                      const deleted = deletePlacementSession(session.id);

                      if (deleted) {
                        refreshSessions();
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="cta ctaSecondary"
              onClick={() => {
                const name = window.prompt("New session name", "Living Room") ?? "";
                const created = createPlacementSession(name);
                refreshSessions(created.id);
                setNotice({ kind: "info", text: `Created session ${created.name}.` });
              }}
            >
              New Placement Session
            </button>
          </div>

          <div className={styles.setupGrid}>
            <label>
              <span className="muted">Session name</span>
              <input
                value={sessionNameDraft}
                onChange={(event) => setSessionNameDraft(event.target.value)}
                onBlur={() => {
                  const nextName = sessionNameDraft.trim();

                  if (!nextName || nextName === activeSession.name) {
                    setSessionNameDraft(activeSession.name);
                    return;
                  }

                  renamePlacementSession(activeSession.id, nextName);
                  refreshSessions(activeSession.id);
                }}
              />
            </label>
            <label>
              <span className="muted">Room label</span>
              <input
                value={roomNameDraft}
                onChange={(event) => setRoomNameDraft(event.target.value)}
                onBlur={() => {
                  updatePlacementRoom(activeSession.id, { name: roomNameDraft.trim() || activeSession.room.name });
                  refreshSessions(activeSession.id);
                }}
              />
            </label>
            <div className={styles.roomInputs}>
              <label>
                <span className="muted">Width (ft)</span>
                <input
                  type="number"
                  min={4}
                  max={60}
                  step={0.5}
                  value={roomWidthDraft}
                  onChange={(event) => setRoomWidthDraft(event.target.value)}
                  onBlur={() => {
                    const value = Number(roomWidthDraft);
                    updatePlacementRoom(activeSession.id, { width: Number.isFinite(value) ? value : activeSession.room.width });
                    refreshSessions(activeSession.id);
                  }}
                />
              </label>
              <label>
                <span className="muted">Height (ft)</span>
                <input
                  type="number"
                  min={4}
                  max={60}
                  step={0.5}
                  value={roomHeightDraft}
                  onChange={(event) => setRoomHeightDraft(event.target.value)}
                  onBlur={() => {
                    const value = Number(roomHeightDraft);
                    updatePlacementRoom(activeSession.id, {
                      height: Number.isFinite(value) ? value : activeSession.room.height
                    });
                    refreshSessions(activeSession.id);
                  }}
                />
              </label>
            </div>

            <button
              type="button"
              className="cta ctaSecondary"
              onClick={() => {
                const payload = exportPlacementSessionPayload(activeSession.id);

                if (!payload) {
                  return;
                }

                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = exportFilename(activeSession.name);
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export Session JSON
            </button>
          </div>
        </section>

        <div className={styles.pinLayout}>
          <section className={`panel ${styles.mapPanel}`}>
            <div className={styles.mapActions}>
              <button type="button" className="cta ctaSecondary" onClick={() => setSetListeningMode((value) => !value)}>
                {setListeningMode ? "Tap Map To Place Listener" : "Set Listening Position"}
              </button>
              <button
                type="button"
                className="cta ctaSecondary"
                onClick={() => {
                  setSetListeningMode(false);
                  setPlacementListeningPosition(activeSession.id, null);
                  refreshSessions(activeSession.id);
                }}
              >
                Clear Listening Marker
              </button>
            </div>

            {notice ? (
              <p className={`${styles.notice} ${notice.kind === "warn" ? styles.noticeWarn : ""}`}>{notice.text}</p>
            ) : null}

            <RoomMapCanvas
              roomWidth={activeSession.room.width}
              roomHeight={activeSession.room.height}
              heatmap={heatmap}
              setListeningMode={setListeningMode}
              listeningPosition={activeSession.room.listeningPosition}
              points={pointSummaries.map((point) => ({
                id: point.id,
                label: point.label,
                x: point.x,
                y: point.y,
                score: point.score,
                isMeasured: point.overallScore !== null,
                isSelected: point.id === selectedPointId,
                qualityFlags: point.qualityFlags
              }))}
              onAddPoint={(x, y) => {
                const created = addCandidatePoint(activeSession.id, { x, y });

                if (created) {
                  setSelectedPointId(created.id);
                  refreshSessions(activeSession.id);
                }
              }}
              onMovePoint={(pointId, x, y) => {
                const updated = updateCandidatePoint(activeSession.id, pointId, { x, y });

                if (!updated) {
                  return;
                }

                setSessions((previous) =>
                  previous.map((session) => {
                    if (session.id !== activeSession.id) {
                      return session;
                    }

                    return {
                      ...session,
                      updatedAt: new Date().toISOString(),
                      candidatePoints: session.candidatePoints.map((point) =>
                        point.id === pointId ? { ...point, x: updated.x, y: updated.y, updatedAt: updated.updatedAt } : point
                      )
                    };
                  })
                );
              }}
              onSelectPoint={setSelectedPointId}
              onSetListeningPosition={(x, y) => {
                setPlacementListeningPosition(activeSession.id, { x, y });
                setSetListeningMode(false);
                refreshSessions(activeSession.id);
              }}
            />

            <div className={styles.metricRow}>
              {metricOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.metricButton} ${metricKey === option.key ? styles.metricButtonActive : ""}`}
                  onClick={() => setMetricKey(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className={styles.legend}>
              <div className={styles.legendBar} />
              <div className={styles.legendLabels}>
                <span>Lower quality</span>
                <span>Higher quality</span>
              </div>
            </div>

            <div className={`${styles.coverageCard} panel`}>
              <p className="muted" style={{ margin: 0 }}>
                Coverage: <strong>{coverage.level.toUpperCase()}</strong> ({coverage.measuredCount} measured pin
                {coverage.measuredCount === 1 ? "" : "s"})
              </p>
              <div className={styles.coverageMeter}>
                <div className={styles.coverageFill} style={{ width: `${Math.round(coverage.score * 100)}%` }} />
              </div>
              <p className={styles.coverageMeta}>
                Average nearest spacing: {coverage.averageNearestDistance.toFixed(2)} ft. More measured points with even spacing
                improve confidence.
              </p>
            </div>
          </section>

          <aside className="panel">
            <h2 className={styles.panelTitle}>Candidate Pins</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Pins are ordered by the selected score view. Measured pins stay visible above the heatmap.
            </p>

            <div className={`${styles.quickHandoff} panel`}>
              <h3 style={{ margin: 0 }}>Quick Test Mode</h3>
              <p className="muted" style={{ margin: 0 }}>
                Need a single fast check? Run a quick test without adding a map point.
              </p>
              <Link href="/record?mode=baseline" className="cta ctaSecondary" style={{ textAlign: "center" }}>
                Open Quick Test
              </Link>
            </div>

            <div className={styles.pinList}>
              {!sortedPoints.length ? (
                <div className={`${styles.emptyFlow} panel`}>
                  <div className={styles.emptyRoomArt} aria-hidden="true" />
                  <p className="muted" style={{ margin: 0 }}>
                    Start a placement session in 3 quick steps:
                  </p>
                  <ol className={styles.emptyFlowSteps}>
                    <li>Drop candidate placement pins.</li>
                    <li>Measure each pin.</li>
                    <li>See heatmap + top recommendations.</li>
                  </ol>
                  <button type="button" className="cta ctaHighlight" onClick={addSuggestedPoint}>
                    Add First Placement Point
                  </button>
                </div>
              ) : null}
              {sortedPoints.map((point) => {
                const qualityIssue = Boolean(point.qualityFlags.clipped || point.qualityFlags.noisy || point.qualityFlags.unstable);

                return (
                  <article
                    key={point.id}
                    className={`${styles.pinRow} ${point.id === selectedPointId ? styles.pinRowSelected : ""}`}
                  >
                    <div className={styles.pinRowTop}>
                      <div>
                        <p className={styles.pinRowTitle}>{point.label}</p>
                        <p className={styles.pinRowMeta}>
                          Score: {formatScore(point.score)}
                          {qualityIssue ? " • quality warning" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.pinSelectButton}
                        onClick={() => setSelectedPointId(point.id)}
                      >
                        Select
                      </button>
                    </div>
                    <div className={styles.pinRowActions}>
                      <button
                        type="button"
                        className={`${styles.pinActionButton} ${styles.pinActionMeasure}`}
                        onClick={() => runMeasurementForPoint(point.id, point.label)}
                      >
                        Measure
                      </button>
                      <button
                        type="button"
                        className={`${styles.pinActionButton} ${styles.pinActionRename}`}
                        onClick={() => {
                          const nextName = window.prompt("Rename pin", point.label);

                          if (!nextName) {
                            return;
                          }

                          updateCandidatePoint(activeSession.id, point.id, { label: nextName });
                          refreshSessions(activeSession.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={`${styles.pinActionButton} ${styles.pinActionDelete}`}
                        onClick={() => {
                          if (!window.confirm(`Delete ${point.label}?`)) {
                            return;
                          }

                          deleteCandidatePoint(activeSession.id, point.id);
                          if (selectedPointId === point.id) {
                            setSelectedPointId("");
                          }
                          refreshSessions(activeSession.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {selectedPoint ? (
              <div className={`${styles.pinEditor} panel`} style={{ marginTop: 10 }}>
                <h3 style={{ margin: 0 }}>Selected Pin</h3>
                <div className={styles.inlineFields}>
                  <label>
                    <span className="muted">Label</span>
                    <input
                      value={pointLabelDraft}
                      onChange={(event) => setPointLabelDraft(event.target.value)}
                      onBlur={() => {
                        if (!selectedPoint) {
                          return;
                        }

                        const next = pointLabelDraft.trim();

                        if (!next) {
                          setPointLabelDraft(selectedPoint.label);
                          return;
                        }

                        updateCandidatePoint(activeSession.id, selectedPoint.id, { label: next });
                        refreshSessions(activeSession.id);
                      }}
                    />
                  </label>
                  <label>
                    <span className="muted">Current score</span>
                    <input value={formatScore(selectedPoint.score)} disabled />
                  </label>
                </div>
                <button
                  type="button"
                  className="cta ctaHighlight"
                  onClick={() => runMeasurementForPoint(selectedPoint.id, selectedPoint.label)}
                >
                  Measure This Point
                </button>
              </div>
            ) : null}

            <div className={`${styles.topPanel} panel`} style={{ marginTop: 10 }}>
              <h3 style={{ margin: 0 }}>Session Summary</h3>
              {topPlacements.length ? (
                topPlacements.map((entry, index) => (
                  <p key={entry.id} className={styles.topItem}>
                    {index + 1}. {entry.label}: {formatScore(entry.overallScore)}
                  </p>
                ))
              ) : (
                <p className={styles.topItem}>Measure at least one pin to rank placements.</p>
              )}
              {worstBandWarning ? (
                <p className="warning" style={{ margin: 0 }}>
                  Worst null-risk band: {worstBandWarning.label} ({worstBandWarning.average.toFixed(1)}). Add points and re-measure
                  before final placement decisions.
                </p>
              ) : (
                <p className={styles.topItem}>No major null-risk band warning yet.</p>
              )}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <Link href="/advanced" className="cta ctaSecondary" style={{ textAlign: "center" }}>
                Back To Advanced Tools
              </Link>
              <Link href="/" className="cta ctaSecondary" style={{ textAlign: "center" }}>
                Back Home
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
