import { getPickWeight, type ScoringScheme } from "./ScoringScheme.js";
import type { Ballot, EntryId, EntryScoreBreakdown } from "./Types.js";

export interface AggregationResult {
    readonly scores: ReadonlyMap<EntryId, EntryScoreBreakdown>;
    readonly leaderboard: readonly EntryScoreBreakdown[];
    readonly totalBallots: number;
    readonly totalPointsAwarded: number;
    readonly expectedPoints: number;
    readonly isConserved: boolean;
}

export function aggregateScores(entryIds: readonly EntryId[], ballots: readonly Ballot[], scheme: ScoringScheme): AggregationResult {
    const positions = scheme.weights.length;
    const counters = new Map<EntryId, number[]>();

    const counterFor = (entryId: EntryId): number[] => {
        let counter = counters.get(entryId);
        if (counter === undefined) {
            counter = new Array<number>(positions).fill(0);
            counters.set(entryId, counter);
        }
        return counter;
    };

    for (const entryId of entryIds) {
        counterFor(entryId);
    }

    for (const ballot of ballots) {
        const limit = Math.min(positions, ballot.picks.length);
        for (let position = 0; position < limit; position++) {
            const pick = ballot.picks[position];
            if (pick !== undefined && pick.length > 0) {
                const counter = counterFor(pick);
                counter[position] = (counter[position] ?? 0) + 1;
            }
        }
    }

    let totalPointsAwarded = 0;
    const partial: Omit<EntryScoreBreakdown, "voteSharePercentage">[] = [];

    for (const [entryId, rankCounts] of counters) {
        let rawScore = 0;
        let appearanceCount = 0;
        rankCounts.forEach((count, position) => {
            rawScore += count * getPickWeight(scheme, position);
            appearanceCount += count;
        });
        totalPointsAwarded += rawScore;
        partial.push({ entryId, rankCounts: Object.freeze([...rankCounts]), appearanceCount, rawScore });
    }

    const scores = new Map<EntryId, EntryScoreBreakdown>();
    for (const item of partial) {
        const voteSharePercentage = totalPointsAwarded > 0 ? Math.round((item.rawScore / totalPointsAwarded) * 10_000) / 100 : 0;
        scores.set(item.entryId, Object.freeze({ ...item, voteSharePercentage }));
    }

    const totalBallots = ballots.length;
    const expectedPoints = totalBallots * scheme.pointsPerBallot;
    const leaderboard = [...scores.values()].sort((a, b) => b.rawScore - a.rawScore);

    return {
        scores,
        leaderboard,
        totalBallots,
        totalPointsAwarded,
        expectedPoints,
        isConserved: totalPointsAwarded === expectedPoints
    };
}
