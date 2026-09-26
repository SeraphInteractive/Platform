import type { ScoringScheme } from "./ScoringScheme.js";
import type { Ballot, EntryId } from "./Types.js";

export enum BallotViolationCode {
    MissingVoter = "MISSING_VOTER",
    WrongPickCount = "WRONG_PICK_COUNT",
    EmptyPick = "EMPTY_PICK",
    DuplicatePick = "DUPLICATE_PICK",
    IneligibleEntry = "INELIGIBLE_ENTRY",
    NotEnoughEntries = "NOT_ENOUGH_ENTRIES"
}

export interface BallotViolation {
    readonly code: BallotViolationCode;
    readonly message: string;
    readonly position?: number;
}

export interface BallotValidationResult {
    readonly isValid: boolean;
    readonly violations: readonly BallotViolation[];
}

export function validateBallot(ballot: Ballot, scheme: ScoringScheme, eligibleEntryIds?: ReadonlySet<EntryId>): BallotValidationResult {
    const violations: BallotViolation[] = [];
    const requiredPicks = scheme.weights.length;

    if (ballot.voterId.trim().length === 0) {
        violations.push({ code: BallotViolationCode.MissingVoter, message: "A ballot must belong to a voter." });
    }

    if (eligibleEntryIds !== undefined && eligibleEntryIds.size < scheme.minimumEntries) {
        violations.push({
            code: BallotViolationCode.NotEnoughEntries,
            message: `At least ${scheme.minimumEntries} eligible entries are required before votes are accepted.`
        });
        return { isValid: false, violations };
    }

    if (ballot.picks.length !== requiredPicks) {
        violations.push({
            code: BallotViolationCode.WrongPickCount,
            message: `Exactly ${requiredPicks} pick(s) are required for a ${scheme.pollType} poll.`
        });
        return { isValid: false, violations };
    }

    const seen = new Set<EntryId>();
    ballot.picks.forEach((pick, position) => {
        if (pick.trim().length === 0) {
            violations.push({ code: BallotViolationCode.EmptyPick, message: `Pick ${position + 1} is empty.`, position });
            return;
        }
        if (seen.has(pick)) {
            violations.push({
                code: BallotViolationCode.DuplicatePick,
                message: `Pick ${position + 1} repeats an entry that was already ranked.`,
                position
            });
        }
        seen.add(pick);
        if (eligibleEntryIds !== undefined && !eligibleEntryIds.has(pick)) {
            violations.push({
                code: BallotViolationCode.IneligibleEntry,
                message: `Pick ${position + 1} is not an eligible entry in this round.`,
                position
            });
        }
    });

    return { isValid: violations.length === 0, violations };
}
