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

    if (prior === 0) {
        return {
            entryId: breakdown.entryId,
            rawScore,
            appearances,
            priorK: 0,
            globalMean,
            regularizedMeanScore: appearances > 0 ? rawScore / appearances : 0,
            regularizedTotalScore: rawScore
        };
    }

    const regularizedMeanScore = (rawScore + prior * globalMean) / (appearances + prior);

    return {
        entryId: breakdown.entryId,
        rawScore,
        appearances,
        priorK: prior,
        globalMean,
        regularizedMeanScore,
        regularizedTotalScore: ballots > 0 ? regularizedMeanScore * ballots : 0
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
        .sort((a, b) => b.regularizedTotalScore - a.regularizedTotalScore);
}
