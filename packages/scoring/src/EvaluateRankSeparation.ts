import type { ScoringScheme } from "./ScoringScheme.js";
import { approximateTwoTailedPValue, calculateMoments, calculatePairwiseCovariance } from "./Statistics.js";
import { SeparationAction, SeparationStatus, type Ballot, type EntryScoreBreakdown, type PairwiseSeparation } from "./Types.js";

export const defaultSeparationZThreshold = 1.96;

export function evaluateRankSeparation(
    breakdownA: EntryScoreBreakdown,
    breakdownB: EntryScoreBreakdown,
    ballots: readonly Ballot[],
    scheme: ScoringScheme,
    zThreshold: number = defaultSeparationZThreshold
): PairwiseSeparation {
    const totalBallots = ballots.length;
    const momentsA = calculateMoments(breakdownA, totalBallots, scheme);
    const momentsB = calculateMoments(breakdownB, totalBallots, scheme);
    const covariance = calculatePairwiseCovariance(breakdownA.entryId, breakdownB.entryId, ballots, scheme);

    // delta evaluates score difference between entry a and entry b
    const deltaScore = breakdownA.rawScore - breakdownB.rawScore;
    const deltaVariance = Math.max(0, momentsA.totalVariance + momentsB.totalVariance - 2 * covariance.totalCovariance);
    const standardError = Math.sqrt(deltaVariance);
    const zScore = standardError > 1e-9 ? deltaScore / standardError : 0;
    const pValue = approximateTwoTailedPValue(zScore);
    // a decisive lead requires positive separation exceeding the threshold
    const isDecisive = zScore >= zThreshold;

    return {
        entryA: breakdownA.entryId,
        entryB: breakdownB.entryId,
        deltaScore,
        varianceA: momentsA.totalVariance,
        varianceB: momentsB.totalVariance,
        covarianceAB: covariance.totalCovariance,
        deltaVariance,
        standardError,
        zScore,
        pValue,
        status: isDecisive ? SeparationStatus.DecisiveLead : SeparationStatus.StatisticalTie,
        recommendedAction: isDecisive ? SeparationAction.DeclareWinner : SeparationAction.TieredRunoff
    };
}

export function evaluateLeadingSeparations(
    leaderboard: readonly EntryScoreBreakdown[],
    ballots: readonly Ballot[],
    scheme: ScoringScheme,
    depth: number,
    zThreshold: number = defaultSeparationZThreshold
): readonly PairwiseSeparation[] {
    const results: PairwiseSeparation[] = [];
    const limit = Math.min(depth, leaderboard.length);
    for (let index = 0; index < limit - 1; index++) {
        const current = leaderboard[index];
        const next = leaderboard[index + 1];
        if (current !== undefined && next !== undefined) {
            results.push(evaluateRankSeparation(current, next, ballots, scheme, zThreshold));
        }
    }
    return results;
}
