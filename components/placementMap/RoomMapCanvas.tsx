"use client";

import { useEffect, useMemo, useRef } from "react";
import { computeIdwHeatmap, heatmapColor, type HeatmapGrid } from "@/lib/placementMap/heatmap";
import type { MeasurementQualityFlags, RoomCoordinate } from "@/lib/placementMap/types";
import styles from "@/components/placementMap/RoomMapCanvas.module.css";

interface PointVisual {
  id: string;
  label: string;
  x: number;
  y: number;
  score: number | null;
  isMeasured: boolean;
  isSelected: boolean;
  qualityFlags: MeasurementQualityFlags;
}

interface RoomMapCanvasProps {
  roomWidth: number;
  roomHeight: number;
  points: PointVisual[];
  listeningPosition?: RoomCoordinate;
  heatmap: HeatmapGrid | null;
  setListeningMode: boolean;
  onAddPoint: (x: number, y: number) => void;
  onMovePoint: (pointId: string, x: number, y: number) => void;
  onSelectPoint: (pointId: string) => void;
  onSetListeningPosition: (x: number, y: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercentX(x: number, roomWidth: number): string {
  return `${(x / roomWidth) * 100}%`;
}

function toPercentY(y: number, roomHeight: number): string {
  return `${(y / roomHeight) * 100}%`;
}

function pointColor(score: number | null): string {
  if (score === null) {
    return "#8f92a5";
  }

  const normalized = clamp(score / 100, 0, 1);
  const hue = 8 + normalized * 122;
  const saturation = 88;
  const lightness = 46 - normalized * 8;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

interface DragState {
  pointId: string;
  moved: boolean;
}

export function RoomMapCanvas({
  roomWidth,
  roomHeight,
  points,
  listeningPosition,
  heatmap,
  setListeningMode,
  onAddPoint,
  onMovePoint,
  onSelectPoint,
  onSetListeningPosition
}: RoomMapCanvasProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const measuredCount = useMemo(() => points.filter((point) => point.isMeasured).length, [points]);

  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    const wrap = wrapRef.current;

    if (!canvas || !wrap) {
      return;
    }

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!heatmap?.cells.length) {
        return;
      }

      const cellWidth = rect.width / heatmap.cols;
      const cellHeight = rect.height / heatmap.rows;

      for (const cell of heatmap.cells) {
        const px = (cell.x / roomWidth) * rect.width - cellWidth / 2;
        const py = (cell.y / roomHeight) * rect.height - cellHeight / 2;

        ctx.fillStyle = heatmapColor(cell.value, heatmap.minValue, heatmap.maxValue, cell.confidence);
        ctx.fillRect(px, py, cellWidth + 0.5, cellHeight + 0.5);
      }
    };

    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(wrap);

    return () => {
      observer.disconnect();
    };
  }, [heatmap, roomHeight, roomWidth]);

  const toRoomCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const wrap = wrapRef.current;

    if (!wrap) {
      return null;
    }

    const rect = wrap.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    const xPercent = clamp((clientX - rect.left) / rect.width, 0, 1);
    const yPercent = clamp((clientY - rect.top) / rect.height, 0, 1);

    return {
      x: xPercent * roomWidth,
      y: yPercent * roomHeight
    };
  };

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      style={{ aspectRatio: `${roomWidth} / ${roomHeight}` }}
      onPointerMove={(event) => {
        const activeDrag = dragRef.current;

        if (!activeDrag) {
          return;
        }

        const coordinates = toRoomCoordinates(event.clientX, event.clientY);

        if (!coordinates) {
          return;
        }

        dragRef.current = {
          ...activeDrag,
          moved: true
        };

        onMovePoint(activeDrag.pointId, coordinates.x, coordinates.y);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onClick={(event) => {
        if (dragRef.current?.moved) {
          dragRef.current = null;
          return;
        }

        const target = event.target as HTMLElement;

        if (target.closest("[data-pin-id]")) {
          return;
        }

        const coordinates = toRoomCoordinates(event.clientX, event.clientY);

        if (!coordinates) {
          return;
        }

        if (setListeningMode) {
          onSetListeningPosition(coordinates.x, coordinates.y);
          return;
        }

        onAddPoint(coordinates.x, coordinates.y);
      }}
    >
      <div className={styles.grid} />
      <canvas ref={heatmapCanvasRef} className={styles.heatmap} aria-hidden="true" />
      <div className={styles.badge}>{heatmap ? `Heatmap active (${measuredCount} measured)` : "Heatmap needs 3+ measured pins"}</div>
      <div className={styles.overlay}>
        {listeningPosition ? (
          <div
            className={styles.listeningMarker}
            style={{
              left: toPercentX(listeningPosition.x, roomWidth),
              top: toPercentY(listeningPosition.y, roomHeight)
            }}
            aria-label="Listening position"
            title="Listening position"
          >
            <div className={styles.listeningDot} />
          </div>
        ) : null}

        {points.map((point) => {
          const showQuality = Boolean(point.qualityFlags.clipped || point.qualityFlags.noisy || point.qualityFlags.unstable);

          return (
            <button
              key={point.id}
              type="button"
              data-pin-id={point.id}
              className={`${styles.pin} ${point.isMeasured ? styles.pinMeasured : ""} ${point.isSelected ? styles.pinSelected : ""}`}
              style={{
                left: toPercentX(point.x, roomWidth),
                top: toPercentY(point.y, roomHeight),
                background: pointColor(point.score)
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                dragRef.current = {
                  pointId: point.id,
                  moved: false
                };
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPoint(point.id);
              }}
              title={`${point.label}${point.score === null ? "" : ` (${point.score.toFixed(1)})`}`}
              aria-label={`Candidate ${point.label}`}
            >
              {showQuality ? <span className={styles.pinQuality} /> : null}
              <span className={styles.pinLabel}>{point.label}</span>
            </button>
          );
        })}

        {!points.length ? (
          <p className={styles.emptyHint}>
            Click inside the room to add a candidate sub placement pin.
            <br />
            Drag pins to adjust exact positions.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function buildHeatmap(
  roomWidth: number,
  roomHeight: number,
  measuredPoints: Array<{ id: string; x: number; y: number; value: number }>
): HeatmapGrid | null {
  return computeIdwHeatmap(roomWidth, roomHeight, measuredPoints, {
    cols: 60,
    rows: 40,
    power: 2,
    epsilon: 0.0001
  });
}
