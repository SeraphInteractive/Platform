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
    let zScore = 0;
    let pValue = 1;
    let isDecisive = false;

    if (totalBallots <= 1) {
        // sample size is insufficient to reject null hypothesis or declare a decisive lead
        zScore = 0;
        pValue = 1;
        isDecisive = false;
    } else if (standardError > 1e-9) {
        zScore = deltaScore / standardError;
        pValue = approximateTwoTailedPValue(zScore);
        isDecisive = zScore >= zThreshold;
    } else if (deltaScore > 0) {
        // deterministic positive lead when sample variance across all ballots is zero
        zScore = 999;
        pValue = 0;
        isDecisive = true;
    } else if (deltaScore < 0) {
        zScore = -999;
        pValue = 0;
        isDecisive = false;
    }

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
