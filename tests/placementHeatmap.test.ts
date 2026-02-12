import { describe, expect, it } from "vitest";
import { computeCoverageSummary, computeIdwHeatmap } from "@/lib/placementMap/heatmap";

describe("placement heatmap interpolation", () => {
  it("requires at least three measured points", () => {
    const grid = computeIdwHeatmap(
      16,
      12,
      [
        { id: "a", x: 2, y: 2, value: 40 },
        { id: "b", x: 14, y: 9, value: 75 }
      ],
      { cols: 24, rows: 16 }
    );

    expect(grid).toBeNull();
  });

  it("generates a bounded grid for sparse candidate points", () => {
    const grid = computeIdwHeatmap(
      16,
      12,
      [
        { id: "a", x: 2, y: 2, value: 40 },
        { id: "b", x: 14, y: 2, value: 80 },
        { id: "c", x: 8, y: 10, value: 60 }
      ],
      { cols: 24, rows: 16 }
    );

    expect(grid).not.toBeNull();
    expect(grid?.cells.length).toBe(24 * 16);
    expect(grid?.minValue).toBeGreaterThanOrEqual(40);
    expect(grid?.maxValue).toBeLessThanOrEqual(80);

    const minConfidence = Math.min(...(grid?.cells.map((cell) => cell.confidence) ?? [0]));
    const maxConfidence = Math.max(...(grid?.cells.map((cell) => cell.confidence) ?? [0]));

    expect(minConfidence).toBeGreaterThan(0);
    expect(maxConfidence).toBeLessThanOrEqual(1);
  });
});

describe("coverage summary", () => {
  it("increases coverage as points become denser", () => {
    const lowCoverage = computeCoverageSummary(16, 12, [
      { x: 2, y: 2 },
      { x: 14, y: 10 }
    ]);

    const highCoverage = computeCoverageSummary(16, 12, [
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 14, y: 2 },
      { x: 2, y: 10 },
      { x: 8, y: 10 },
      { x: 14, y: 10 }
    ]);

    expect(lowCoverage.level).toBe("low");
    expect(highCoverage.level).not.toBe("low");
    expect(highCoverage.score).toBeGreaterThan(lowCoverage.score);
  });
});
