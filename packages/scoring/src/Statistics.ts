import { scoreForEntry } from "./BuildScoreMatrix.js";
import { getPickWeight, type ScoringScheme } from "./ScoringScheme.js";
import type { Ballot, EntryId, EntryMoments, EntryScoreBreakdown } from "./Types.js";

export interface PairwiseCovariance {
    readonly singleBallotCovariance: number;
    readonly totalCovariance: number;
    readonly jointExpectation: number;
    readonly coOccurrenceCount: number;
}

export function calculateMoments(breakdown: EntryScoreBreakdown, totalBallots: number, scheme: ScoringScheme): EntryMoments {
    if (totalBallots <= 0) {
        return {
            entryId: breakdown.entryId,
            rankProbabilities: breakdown.rankCounts.map(() => 0),
            omissionProbability: 1,
            expectedScorePerVoter: 0,
            secondMoment: 0,
            singleBallotVariance: 0,
            totalVariance: 0,
            standardDeviation: 0
        };
    }

    const rankProbabilities = breakdown.rankCounts.map((count) => count / totalBallots);
    let expectedScorePerVoter = 0;
    let secondMoment = 0;
    rankProbabilities.forEach((probability, position) => {
        const weight = getPickWeight(scheme, position);
        expectedScorePerVoter += weight * probability;
        secondMoment += weight * weight * probability;
    });

    const covered = rankProbabilities.reduce((sum, probability) => sum + probability, 0);
    const singleBallotVariance = Math.max(0, secondMoment - expectedScorePerVoter * expectedScorePerVoter);
    const totalVariance = totalBallots * singleBallotVariance;

    return {
        entryId: breakdown.entryId,
        rankProbabilities,
        omissionProbability: Math.max(0, 1 - covered),
        expectedScorePerVoter,
        secondMoment,
        singleBallotVariance,
        totalVariance,
        standardDeviation: Math.sqrt(totalVariance)
    };
}

export function calculatePairwiseCovariance(
    entryA: EntryId,
    entryB: EntryId,
    ballots: readonly Ballot[],
    scheme: ScoringScheme
): PairwiseCovariance {
    const count = ballots.length;
    if (count === 0) {
        return { singleBallotCovariance: 0, totalCovariance: 0, jointExpectation: 0, coOccurrenceCount: 0 };
    }

    let sumA = 0;
    let sumB = 0;
    let sumProduct = 0;
    let coOccurrenceCount = 0;

    for (const ballot of ballots) {
        const scoreA = scoreForEntry(ballot, entryA, scheme);
        const scoreB = scoreForEntry(ballot, entryB, scheme);
        sumA += scoreA;
        sumB += scoreB;
        sumProduct += scoreA * scoreB;
        if (scoreA > 0 && scoreB > 0) {
            coOccurrenceCount++;
        }
    }

    const jointExpectation = sumProduct / count;
    const singleBallotCovariance = jointExpectation - (sumA / count) * (sumB / count);

    return {
        singleBallotCovariance,
        totalCovariance: count * singleBallotCovariance,
        jointExpectation,
        coOccurrenceCount
    };
}

export function approximateTwoTailedPValue(zScore: number): number {
    const absolute = Math.abs(zScore);
    if (!Number.isFinite(absolute) || absolute > 8) {
        return 0;
    }

    const x = absolute / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * x);
    const polynomial = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    const complementaryError = polynomial * Math.exp(-x * x);

    return Math.min(1, Math.max(0, complementaryError));
}

export function calculateConfidenceInterval(
    deltaScore: number,
    standardError: number,
    zThreshold: number
): { readonly lower: number; readonly upper: number } {
    const margin = zThreshold * standardError;
    return { lower: deltaScore - margin, upper: deltaScore + margin };
}
