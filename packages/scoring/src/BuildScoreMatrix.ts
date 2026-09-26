import { getPickWeight, type ScoringScheme } from "./ScoringScheme.js";
import type { Ballot, EntryId } from "./Types.js";

export interface ScoreMatrix {
    readonly entryToIndex: ReadonlyMap<EntryId, number>;
    readonly indexToEntry: readonly EntryId[];
    readonly rows: readonly (readonly number[])[];
}

export function buildScoreMatrix(entryIds: readonly EntryId[], ballots: readonly Ballot[], scheme: ScoringScheme): ScoreMatrix {
    const entryToIndex = new Map<EntryId, number>(entryIds.map((entryId, index) => [entryId, index]));
    const rows = ballots.map((ballot) => {
        const row = new Array<number>(entryIds.length).fill(0);
        ballot.picks.forEach((pick, position) => {
            const index = entryToIndex.get(pick);
            if (index !== undefined) {
                row[index] = getPickWeight(scheme, position);
            }
        });
        return row;
    });

    return { entryToIndex, indexToEntry: [...entryIds], rows };
}

export function scoreForEntry(ballot: Ballot, entryId: EntryId, scheme: ScoringScheme): number {
    const position = ballot.picks.indexOf(entryId);
    return position < 0 ? 0 : getPickWeight(scheme, position);
}
