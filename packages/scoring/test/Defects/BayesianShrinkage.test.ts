import { describe, expect, it } from "vitest";
import {
    calculateBayesianShrinkage,
    calculateRegularizedLeaderboard,
    getScoringScheme,
    PollType,
    type EntryScoreBreakdown
} from "../../src/index.js";

const ranked = getScoringScheme(PollType.RankedChoice);

function createBreakdown(entryId: string, rankCounts: number[]): EntryScoreBreakdown {
    const rawScore = rankCounts.reduce((sum, count, index) => sum + count * (ranked.weights[index] ?? 0), 0);
    const appearanceCount = rankCounts.reduce((sum, count) => sum + count, 0);
    return { entryId, rankCounts, appearanceCount, rawScore, voteSharePercentage: 0 };
}

describe("BayesianShrinkage defect reproducer (B4)", () => {
    it("prevents NaN score propagation when priorK is Infinity", () => {
        const item = createBreakdown("e1", [10, 5, 2]);

        // calculating shrinkage with infinite prior should remain finite or throw rather than evaluate to nan
        const result = calculateBayesianShrinkage(item, 10, 100, ranked, Number.POSITIVE_INFINITY);

        expect(Number.isFinite(result.regularizedMeanScore)).toBe(true);
        expect(Number.isFinite(result.regularizedTotalScore)).toBe(true);
    });

    it("prevents NaN score propagation when priorK is NaN", () => {
        const item = createBreakdown("e1", [10, 5, 2]);

        // passing nan prior must not silently produce nan mean and total scores
        const result = calculateBayesianShrinkage(item, 10, 100, ranked, Number.NaN);

        expect(Number.isNaN(result.regularizedMeanScore)).toBe(false);
        expect(Number.isNaN(result.regularizedTotalScore)).toBe(false);
    });

    it("prevents NaN score propagation when totalEntries is NaN", () => {
        const item = createBreakdown("e1", [10, 5, 2]);

        // invalid entry counts should not corrupt downstream regularized totals
        const result = calculateBayesianShrinkage(item, Number.NaN, 100, ranked, 30);

        expect(Number.isFinite(result.regularizedMeanScore)).toBe(true);
        expect(Number.isFinite(result.regularizedTotalScore)).toBe(true);
    });

    it("prevents leaderboard sort disruption from non-finite regularized scores", () => {
        const breakdowns = [createBreakdown("e1", [20, 10, 5]), createBreakdown("e2", [15, 12, 8]), createBreakdown("e3", [5, 2, 1])];

        // when prior is non-finite, all leaderboard items must retain finite regularized totals
        const leaderboard = calculateRegularizedLeaderboard(breakdowns, 10, 100, ranked, Number.POSITIVE_INFINITY);

        for (const entry of leaderboard) {
            expect(Number.isFinite(entry.regularizedTotalScore)).toBe(true);
        }
    });
});
