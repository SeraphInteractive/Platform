import { describe, expect, it } from "vitest";
import {
    aggregateScores,
    analyzeRaidRisk,
    BallotViolationCode,
    buildScoreMatrix,
    calculateBayesianShrinkage,
    calculateMoments,
    calculatePairwiseCovariance,
    calculateRankEntropy,
    calculateRegularizedLeaderboard,
    calculateSkewRatio,
    calculateVelocityZScore,
    evaluateLeadingSeparations,
    evaluateRankSeparation,
    getScoringScheme,
    PollType,
    RaidFlag,
    RaidSeverity,
    SeparationAction,
    SeparationStatus,
    validateBallot,
    type Ballot,
    type EntryScoreBreakdown
} from "../src/index.js";

const ranked = getScoringScheme(PollType.RankedChoice);
const binary = getScoringScheme(PollType.Binary);

function breakdown(entryId: string, rankCounts: number[], scheme = ranked): EntryScoreBreakdown {
    const rawScore = rankCounts.reduce((sum, count, position) => sum + count * (scheme.weights[position] ?? 0), 0);
    const appearanceCount = rankCounts.reduce((sum, count) => sum + count, 0);
    return { entryId, rankCounts, appearanceCount, rawScore, voteSharePercentage: 0 };
}

describe("ballot validation", () => {
    it("accepts complete distinct ranked ballots", () => {
        const result = validateBallot({ voterId: "v1", picks: ["a", "b", "c"] }, ranked);
        expect(result.isValid).toBe(true);
        expect(result.violations).toHaveLength(0);
    });

    it("rejects stacked picks", () => {
        const result = validateBallot({ voterId: "v1", picks: ["a", "a", "b"] }, ranked);
        expect(result.isValid).toBe(false);
        expect(result.violations.map((violation) => violation.code)).toContain(BallotViolationCode.DuplicatePick);
    });

    it("rejects partial ranked ballots and oversized binary ballots", () => {
        expect(validateBallot({ voterId: "v1", picks: ["a", "b"] }, ranked).isValid).toBe(false);
        expect(validateBallot({ voterId: "v1", picks: ["a", "b"] }, binary).isValid).toBe(false);
        expect(validateBallot({ voterId: "v1", picks: [""] }, binary).isValid).toBe(false);
    });

    it("rejects entries outside the eligible set", () => {
        const eligible = new Set(["a", "b", "c"]);
        const result = validateBallot({ voterId: "v1", picks: ["a", "b", "z"] }, ranked, eligible);
        expect(result.violations.map((violation) => violation.code)).toEqual([BallotViolationCode.IneligibleEntry]);
    });

    it("refuses votes until the round has enough eligible entries", () => {
        const result = validateBallot({ voterId: "v1", picks: ["a"] }, binary, new Set(["a"]));
        expect(result.violations[0]?.code).toBe(BallotViolationCode.NotEnoughEntries);
    });
});

describe("aggregation", () => {
    it("conserves 6N points over 1000 random ranked ballots", () => {
        const entries = ["e1", "e2", "e3", "e4", "e5", "e6"];
        const ballots: Ballot[] = Array.from({ length: 1000 }, (_, index) => {
            const shuffled = [...entries].sort(() => Math.random() - 0.5);
            return { voterId: `v${index}`, picks: shuffled.slice(0, 3) };
        });
        const result = aggregateScores(entries, ballots, ranked);
        expect(result.totalBallots).toBe(1000);
        expect(result.expectedPoints).toBe(6000);
        expect(result.totalPointsAwarded).toBe(6000);
        expect(result.isConserved).toBe(true);
    });

    it("scores binary polls with 1N conservation and vote share", () => {
        const ballots: Ballot[] = ["a", "a", "a", "b", "b"].map((pick, index) => ({ voterId: `v${index}`, picks: [pick] }));
        const result = aggregateScores(["a", "b"], ballots, binary);
        expect(result.totalPointsAwarded).toBe(5);
        expect(result.isConserved).toBe(true);
        expect(result.scores.get("a")?.rawScore).toBe(3);
        expect(result.scores.get("a")?.voteSharePercentage).toBe(60);
        expect(result.scores.get("b")?.voteSharePercentage).toBe(40);
        expect(result.leaderboard[0]?.entryId).toBe("a");
    });

    it("builds a weighted score matrix", () => {
        const matrix = buildScoreMatrix(
            ["a", "b", "c", "d"],
            [
                { voterId: "v1", picks: ["a", "b", "c"] },
                { voterId: "v2", picks: ["b", "c", "d"] }
            ],
            ranked
        );
        expect(matrix.rows[0]).toEqual([3, 2, 1, 0]);
        expect(matrix.rows[1]).toEqual([0, 3, 2, 1]);
    });
});

describe("statistics", () => {
    it("computes moments with squared payoffs", () => {
        const moments = calculateMoments(breakdown("x", [40, 30, 10]), 100, ranked);
        expect(moments.omissionProbability).toBeCloseTo(0.2, 9);
        expect(moments.expectedScorePerVoter).toBeCloseTo(1.9, 9);
        expect(moments.secondMoment).toBeCloseTo(4.9, 9);
        expect(moments.singleBallotVariance).toBeCloseTo(1.29, 9);
        expect(moments.totalVariance).toBeCloseTo(129, 9);
    });

    it("finds negative covariance between competing entries", () => {
        const ballots: Ballot[] = [
            { voterId: "v1", picks: ["a", "b", "c"] },
            { voterId: "v2", picks: ["b", "a", "c"] },
            { voterId: "v3", picks: ["a", "c", "b"] },
            { voterId: "v4", picks: ["b", "c", "a"] }
        ];
        expect(calculatePairwiseCovariance("a", "b", ballots, ranked).totalCovariance).toBeLessThan(0);
    });

    it("recommends a runoff for a statistical tie", () => {
        const ballots: Ballot[] = Array.from({ length: 100 }, (_, index) => {
            if (index < 20) {
                return { voterId: `v${index}`, picks: ["a", "b", "c"] };
            }
            if (index < 40) {
                return { voterId: `v${index}`, picks: ["b", "a", "c"] };
            }
            if (index < 70) {
                return { voterId: `v${index}`, picks: ["c", "a", "b"] };
            }
            return { voterId: `v${index}`, picks: ["c", "b", "a"] };
        });
        const result = evaluateRankSeparation(breakdown("a", [20, 50, 30]), breakdown("b", [20, 50, 28]), ballots, ranked);
        expect(result.deltaScore).toBe(2);
        expect(Math.abs(result.zScore)).toBeLessThan(1.96);
        expect(result.status).toBe(SeparationStatus.StatisticalTie);
        expect(result.recommendedAction).toBe(SeparationAction.TieredRunoff);
    });

    it("declares a decisive lead", () => {
        const ballots: Ballot[] = Array.from({ length: 100 }, (_, index) => ({ voterId: `v${index}`, picks: ["a", "b", "c"] }));
        const result = evaluateRankSeparation(breakdown("a", [90, 10, 0]), breakdown("w", [0, 5, 15]), ballots, ranked);
        expect(result.zScore).toBeGreaterThan(5);
        expect(result.status).toBe(SeparationStatus.DecisiveLead);
    });

    it("uses binary weights for binary separation", () => {
        const ballots: Ballot[] = Array.from({ length: 100 }, (_, index) => ({ voterId: `v${index}`, picks: [index < 51 ? "a" : "b"] }));
        const aggregation = aggregateScores(["a", "b"], ballots, binary);
        const [separation] = evaluateLeadingSeparations(aggregation.leaderboard, ballots, binary, 5);
        expect(separation?.deltaScore).toBe(2);
        expect(separation?.status).toBe(SeparationStatus.StatisticalTie);
        expect(separation?.varianceA).toBeCloseTo(100 * 0.51 * 0.49, 9);
    });
});

describe("bayesian shrinkage", () => {
    it("prevents a single first-place vote from sniping an established favourite", () => {
        const cold = calculateBayesianShrinkage(breakdown("cold", [1, 0, 0]), 20, 200, ranked, 30);
        const established = calculateBayesianShrinkage(breakdown("fav", [100, 50, 0]), 20, 200, ranked, 30);
        expect(cold.globalMean).toBeCloseTo(0.3, 9);
        expect(cold.regularizedTotalScore).toBeLessThan(80);
        expect(established.regularizedTotalScore).toBeGreaterThan(400);
    });

    it("sorts the regularized leaderboard", () => {
        const leaderboard = calculateRegularizedLeaderboard(
            [breakdown("e1", [1, 0, 0]), breakdown("e2", [50, 20, 10]), breakdown("e3", [20, 30, 20])],
            10,
            100,
            ranked
        );
        expect(leaderboard.map((item) => item.entryId)).toEqual(["e2", "e3", "e1"]);
    });
});

describe("raid detection", () => {
    it("treats organic favourites as normal", () => {
        const organic = breakdown("organic", [30, 35, 25]);
        expect(Math.abs(calculateSkewRatio(organic, ranked) - 1)).toBeLessThan(0.2);
        expect(calculateRankEntropy(organic)).toBeGreaterThan(0.9);
        const telemetry = analyzeRaidRisk(organic, 0.2, ranked);
        expect(telemetry.severity).toBe(RaidSeverity.Normal);
        expect(telemetry.flags).toHaveLength(0);
    });

    it("flags a brigaded ranked entry as critical", () => {
        const telemetry = analyzeRaidRisk(breakdown("raid", [200, 2, 1]), 3.5, ranked);
        expect(telemetry.severity).toBe(RaidSeverity.CriticalRaid);
        expect(telemetry.flags).toEqual([RaidFlag.UnnaturalRank1HyperSkew, RaidFlag.CollapsedRankEntropy, RaidFlag.AnomalousVelocityBurst]);
    });

    it("does not quarantine every popular binary option", () => {
        const telemetry = analyzeRaidRisk(breakdown("popular", [500], binary), 0, binary);
        expect(telemetry.severity).toBe(RaidSeverity.Normal);
        expect(telemetry.compositeScore).toBe(0);
    });

    it("escalates binary velocity bursts to staff without auto-quarantine", () => {
        const telemetry = analyzeRaidRisk(breakdown("burst", [500], binary), 5, binary);
        expect(telemetry.severity).toBe(RaidSeverity.Suspicious);
        expect(telemetry.flags).toEqual([RaidFlag.AnomalousVelocityBurst]);
    });

    it("stays finite for empty breakdowns and degenerate epsilon", () => {
        const empty = breakdown("empty", [0, 0, 0]);
        expect(calculateSkewRatio(empty, ranked, 0)).toBe(1);
        expect(analyzeRaidRisk(empty, Number.NaN, ranked).flags).toEqual([RaidFlag.InsufficientSampleSize]);
    });

    it("computes velocity z-scores against the preceding windows only", () => {
        expect(calculateVelocityZScore(5, 5)).toBe(0);
        expect(calculateVelocityZScore(12, 12)).toBe(0);
        expect(calculateVelocityZScore(30, 74)).toBeCloseTo(13, 9);
        expect(calculateVelocityZScore(4, 48)).toBe(0);
    });
});
