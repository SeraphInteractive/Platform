import { describe, expect, it } from "vitest";
import {
    evaluateRankSeparation,
    getScoringScheme,
    PollType,
    SeparationAction,
    SeparationStatus,
    type Ballot,
    type EntryScoreBreakdown
} from "../../src/index.js";

const ranked = getScoringScheme(PollType.RankedChoice);

function createBreakdown(entryId: string, rankCounts: number[]): EntryScoreBreakdown {
    const rawScore = rankCounts.reduce((sum, count, index) => sum + count * (ranked.weights[index] ?? 0), 0);
    const appearanceCount = rankCounts.reduce((sum, count) => sum + count, 0);
    return { entryId, rankCounts, appearanceCount, rawScore, voteSharePercentage: 0 };
}

describe("EvaluateRankSeparation defect reproducer (B5)", () => {
    it("does not declare a decisive lead or declare a winner when only 1 ballot is cast (N=1)", () => {
        const ballot: Ballot = { voterId: "v1", picks: ["entry-1", "entry-2", "entry-3"] };
        const breakdownA = createBreakdown("entry-1", [1, 0, 0]);
        const breakdownB = createBreakdown("entry-2", [0, 1, 0]);

        // with a sample size of 1 ballot, zero sample variance must not trigger a decisive winner
        const result = evaluateRankSeparation(breakdownA, breakdownB, [ballot], ranked);

        expect(result.status).not.toBe(SeparationStatus.DecisiveLead);
        expect(result.recommendedAction).not.toBe(SeparationAction.DeclareWinner);
    });

    it("does not report zero p-value on a single ballot sample", () => {
        const ballot: Ballot = { voterId: "v1", picks: ["entry-1", "entry-2"] };
        const breakdownA = createBreakdown("entry-1", [1, 0]);
        const breakdownB = createBreakdown("entry-2", [0, 1]);

        // single ballot cannot reject the null hypothesis with certainty
        const result = evaluateRankSeparation(breakdownA, breakdownB, [ballot], ranked);

        expect(result.pValue).toBeGreaterThan(0.01);
    });

    it("does not assign an artificial z-score of 999 when sample variance is zero on under-sampled contests", () => {
        const ballot: Ballot = { voterId: "v1", picks: ["entry-1", "entry-2", "entry-3"] };
        const breakdownA = createBreakdown("entry-1", [1, 0, 0]);
        const breakdownB = createBreakdown("entry-2", [0, 1, 0]);

        // under-sampled contest should not jump to ceiling z-score 999
        const result = evaluateRankSeparation(breakdownA, breakdownB, [ballot], ranked);

        expect(result.zScore).toBeLessThan(100);
    });
});
