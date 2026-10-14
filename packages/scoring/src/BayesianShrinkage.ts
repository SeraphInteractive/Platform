import type { ScoringScheme } from "./ScoringScheme.js";
import type { BayesianShrinkageResult, EntryScoreBreakdown } from "./Types.js";

export const defaultShrinkagePriorK = 30;

export function calculateBayesianShrinkage(
    breakdown: EntryScoreBreakdown,
    totalEntries: number,
    totalBallots: number,
    scheme: ScoringScheme,
    priorK: number = defaultShrinkagePriorK
): BayesianShrinkageResult {
    const entries = Math.max(1, totalEntries);
    const ballots = Math.max(0, totalBallots);
    const prior = Math.max(0, priorK);
    const globalMean = scheme.pointsPerBallot / entries;
    const { rawScore, appearanceCount: appearances } = breakdown;

    if (prior === 0 || ballots === 0) {
        return {
            entryId: breakdown.entryId,
            rawScore,
            appearances,
            priorK: prior,
            globalMean,
            regularizedMeanScore: ballots > 0 ? rawScore / ballots : 0,
            regularizedTotalScore: rawScore
        };
    }

    // shrink against total contest ballots to avoid phantom points for zero-vote entries
    const regularizedMeanScore = (rawScore + prior * globalMean) / (ballots + prior);

    return {
        entryId: breakdown.entryId,
        rawScore,
        appearances,
        priorK: prior,
        globalMean,
        regularizedMeanScore,
        regularizedTotalScore: regularizedMeanScore * ballots
    };
}

export function calculateRegularizedLeaderboard(
    breakdowns: readonly EntryScoreBreakdown[],
    totalEntries: number,
    totalBallots: number,
    scheme: ScoringScheme,
    priorK: number = defaultShrinkagePriorK
): readonly BayesianShrinkageResult[] {
    return breakdowns
        .map((breakdown) => calculateBayesianShrinkage(breakdown, totalEntries, totalBallots, scheme, priorK))
        .sort(
            (a, b) =>
                b.rawScore - a.rawScore ||
                b.regularizedTotalScore - a.regularizedTotalScore ||
                a.entryId.localeCompare(b.entryId)
        );
}
