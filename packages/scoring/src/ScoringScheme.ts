export enum PollType {
    RankedChoice = "ranked_choice",
    Binary = "binary"
}

export interface ScoringScheme {
    readonly pollType: PollType;
    readonly weights: readonly number[];
    readonly pointsPerBallot: number;
    readonly minimumEntries: number;
}

const rankedChoiceWeights: readonly number[] = Object.freeze([3, 2, 1]);
const binaryWeights: readonly number[] = Object.freeze([1]);

const schemes: ReadonlyMap<PollType, ScoringScheme> = new Map<PollType, ScoringScheme>([
    [
        PollType.RankedChoice,
        Object.freeze({
            pollType: PollType.RankedChoice,
            weights: rankedChoiceWeights,
            pointsPerBallot: rankedChoiceWeights.reduce((sum, weight) => sum + weight, 0),
            minimumEntries: rankedChoiceWeights.length
        })
    ],
    [
        PollType.Binary,
        Object.freeze({
            pollType: PollType.Binary,
            weights: binaryWeights,
            pointsPerBallot: binaryWeights.reduce((sum, weight) => sum + weight, 0),
            minimumEntries: 2
        })
    ]
]);

export function getScoringScheme(pollType: PollType): ScoringScheme {
    const scheme = schemes.get(pollType);
    if (scheme === undefined) {
        throw new RangeError(`Unsupported poll type: ${pollType as string}`);
    }
    return scheme;
}

export function getPickWeight(scheme: ScoringScheme, position: number): number {
    return scheme.weights[position] ?? 0;
}
