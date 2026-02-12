export interface HeatmapPoint {
  id: string;
  x: number;
  y: number;
  value: number;
}

export interface HeatmapCell {
  x: number;
  y: number;
  value: number;
  confidence: number;
  nearestDistance: number;
}

export interface HeatmapGrid {
  cols: number;
  rows: number;
  cells: HeatmapCell[];
  minValue: number;
  maxValue: number;
}

export interface HeatmapOptions {
  cols?: number;
  rows?: number;
  power?: number;
  epsilon?: number;
  confidenceFadeDistance?: number;
}

export interface CoverageSummary {
  level: "low" | "medium" | "high";
  score: number;
  measuredCount: number;
  averageNearestDistance: number;
  normalizedSpacing: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(aX: number, aY: number, bX: number, bY: number): number {
  return Math.hypot(aX - bX, aY - bY);
}

function nearestDistanceToPoints(x: number, y: number, points: HeatmapPoint[]): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (const point of points) {
    nearest = Math.min(nearest, distance(x, y, point.x, point.y));
  }

  return Number.isFinite(nearest) ? nearest : 0;
}

export function computeIdwHeatmap(
  roomWidth: number,
  roomHeight: number,
  points: HeatmapPoint[],
  options: HeatmapOptions = {}
): HeatmapGrid | null {
  if (!Number.isFinite(roomWidth) || !Number.isFinite(roomHeight) || roomWidth <= 0 || roomHeight <= 0) {
    return null;
  }

  if (points.length < 3) {
    return null;
  }

  const cols = Math.max(12, Math.round(options.cols ?? 60));
  const rows = Math.max(8, Math.round(options.rows ?? 40));
  const power = options.power ?? 2;
  const epsilon = options.epsilon ?? 0.0001;
  const diagonal = Math.hypot(roomWidth, roomHeight);
  const fadeDistance = Math.max(0.01, options.confidenceFadeDistance ?? diagonal * 0.45);
  // TODO: Optionally mask interpolation outside measured-point convex hull in a future iteration.

  const cells: HeatmapCell[] = [];
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < rows; row += 1) {
    const y = ((row + 0.5) / rows) * roomHeight;

    for (let col = 0; col < cols; col += 1) {
      const x = ((col + 0.5) / cols) * roomWidth;

      let weightedTotal = 0;
      let totalWeight = 0;

      for (const point of points) {
        const dist = distance(x, y, point.x, point.y);
        const clampedDistance = Math.max(0.001, dist);
        const weight = 1 / (clampedDistance ** power + epsilon);
        weightedTotal += point.value * weight;
        totalWeight += weight;
      }

      const value = totalWeight > 0 ? weightedTotal / totalWeight : 0;
      const nearestDistance = nearestDistanceToPoints(x, y, points);
      const confidence = clamp(1 - nearestDistance / fadeDistance, 0.12, 1);

      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);

      cells.push({
        x,
        y,
        value,
        confidence,
        nearestDistance
      });
    }
  }

  if (!cells.length) {
    return null;
  }

  return {
    cols,
    rows,
    cells,
    minValue,
    maxValue
  };
}

export function heatmapColor(value: number, minValue: number, maxValue: number, confidence: number): string {
  const range = Math.max(1, maxValue - minValue);
  const normalized = clamp((value - minValue) / range, 0, 1);
  const hue = 8 + normalized * 122;
  const saturation = 84;
  const lightness = 58 - normalized * 15;
  const alpha = 0.08 + confidence * 0.7;

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
}

export function computeCoverageSummary(roomWidth: number, roomHeight: number, points: Array<{ x: number; y: number }>): CoverageSummary {
  const measuredCount = points.length;

  if (measuredCount === 0) {
    return {
      level: "low",
      score: 0,
      measuredCount,
      averageNearestDistance: 0,
      normalizedSpacing: 1
    };
  }

  const diagonal = Math.max(0.01, Math.hypot(roomWidth, roomHeight));

  if (measuredCount === 1) {
    return {
      level: "low",
      score: 0.15,
      measuredCount,
      averageNearestDistance: diagonal,
      normalizedSpacing: 1
    };
  }

  const nearestDistances = points.map((point, pointIndex) => {
    let nearest = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length; index += 1) {
      if (index === pointIndex) {
        continue;
      }

      const candidate = points[index];
      nearest = Math.min(nearest, distance(point.x, point.y, candidate.x, candidate.y));
    }

    return Number.isFinite(nearest) ? nearest : diagonal;
  });

  const averageNearestDistance = nearestDistances.reduce((sum, entry) => sum + entry, 0) / nearestDistances.length;
  const normalizedSpacing = clamp(averageNearestDistance / diagonal, 0, 1);

  const countFactor = clamp((measuredCount - 2) / 6, 0, 1);
  const spacingFactor = clamp(1 - normalizedSpacing / 0.45, 0, 1);
  const score = clamp(countFactor * 0.65 + spacingFactor * 0.35, 0, 1);

  let level: CoverageSummary["level"] = "low";

  if (score >= 0.72) {
    level = "high";
  } else if (score >= 0.45) {
    level = "medium";
  }

  return {
    level,
    score,
    measuredCount,
    averageNearestDistance,
    normalizedSpacing
  };
}
