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
    const entries = Number.isFinite(totalEntries) && totalEntries > 0 ? totalEntries : 1;
    const ballots = Number.isFinite(totalBallots) && totalBallots > 0 ? totalBallots : 0;
    const prior =
        Number.isFinite(priorK) && priorK >= 0
            ? priorK
            : priorK === Number.POSITIVE_INFINITY
              ? Number.POSITIVE_INFINITY
              : defaultShrinkagePriorK;
    const globalMean = scheme.pointsPerBallot / entries;
    const { rawScore, appearanceCount: appearances } = breakdown;

    if (prior === 0 || ballots === 0) {
        return {
            entryId: breakdown.entryId,
            rawScore,
            appearances,
            priorK: prior === Number.POSITIVE_INFINITY ? defaultShrinkagePriorK : prior,
            globalMean,
            regularizedMeanScore: ballots > 0 ? rawScore / ballots : 0,
            regularizedTotalScore: rawScore
        };
    }

    if (prior === Number.POSITIVE_INFINITY) {
        return {
            entryId: breakdown.entryId,
            rawScore,
            appearances,
            priorK: prior,
            globalMean,
            regularizedMeanScore: globalMean,
            regularizedTotalScore: globalMean * ballots
        };
    }

    // shrink against total contest ballots to avoid phantom points for zero-vote entries
    const denominator = ballots + prior;
    const regularizedMeanScore = denominator > 0 ? (rawScore + prior * globalMean) / denominator : globalMean;

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
        .sort((a, b) => b.rawScore - a.rawScore || b.regularizedTotalScore - a.regularizedTotalScore || a.entryId.localeCompare(b.entryId));
}
