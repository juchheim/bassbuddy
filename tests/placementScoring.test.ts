import { describe, expect, it } from "vitest";
import { scorePlacementResponse } from "@/lib/placementMap/scoring";

const FREQUENCIES = [25, 31.5, 40, 50, 63, 80, 100, 125];

describe("placement scoring", () => {
  it("scores smooth responses higher than jagged responses", () => {
    const smooth = [-2, -1, 0, 1, 1, 0, -1, -2];
    const jagged = [-12, 6, -9, 7, -10, 8, -11, 7];

    const smoothScore = scorePlacementResponse(FREQUENCIES, smooth);
    const jaggedScore = scorePlacementResponse(FREQUENCIES, jagged);

    expect(smoothScore.overall.score).toBeGreaterThan(jaggedScore.overall.score);
    expect(smoothScore.overall.smoothnessPenalty).toBeLessThan(jaggedScore.overall.smoothnessPenalty);
  });

  it("penalizes deep nulls more than equivalent peaks", () => {
    const mostlyFlat = [0, 0, 0, 0, 0, 0, 0, 0];
    const deepNull = [0, 0, -14, 0, 0, 0, 0, 0];
    const largePeak = [0, 0, 10, 0, 0, 0, 0, 0];

    const nullScore = scorePlacementResponse(FREQUENCIES, deepNull);
    const peakScore = scorePlacementResponse(FREQUENCIES, largePeak);
    const flatScore = scorePlacementResponse(FREQUENCIES, mostlyFlat);

    expect(flatScore.overall.score).toBeGreaterThan(nullScore.overall.score);
    expect(flatScore.overall.score).toBeGreaterThan(peakScore.overall.score);
    expect(nullScore.overall.score).toBeLessThan(peakScore.overall.score);
    expect(nullScore.overall.nullPenalty).toBeGreaterThan(peakScore.overall.peakPenalty);
  });

  it("returns per-band scores for all default bands", () => {
    const response = scorePlacementResponse(FREQUENCIES, [-2, -1, -1, 0, 1, 2, 1, 0]);

    expect(Object.keys(response.bandScores).length).toBe(4);
    expect(response.bandScores.band_20_31_5).toBeGreaterThanOrEqual(0);
    expect(response.bandScores.band_80_120).toBeGreaterThanOrEqual(0);
  });
});
