import { getScoringScheme, validateBallot } from "@platform/scoring";
import { and, asc, count, eq } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { AuthenticatedUser } from "../../Common/Security/Principal.js";
import { hmacHex } from "../../Common/Security/Secrets.js";
import { EntryStatus, RoundStatus } from "../../Domain/Enums.js";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { ballots, entries, users, votingRounds, type BallotRecord } from "../../Infrastructure/Database/Schema.js";
import { RoundEventType, type EventBus } from "../../Infrastructure/Events/EventBus.js";
import { NotificationType, personOfUser, roundReferenceOf, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import { isAcceptingVotes } from "../Rounds/RoundPresenter.js";
import { canSeeDrafts } from "../Rounds/RoundVisibility.js";
import type { RaidMonitor } from "../Telemetry/RaidMonitor.js";

export interface LedgerRow {
    readonly voter: string;
    readonly picks: readonly string[];
    readonly castAt: Date;
    readonly updatedAt: Date;
}

const blockedNoticeTtlSeconds = 10 * 60;
const ballotNoticeTtlSeconds = 30 * 60;

export function picksOf(ballot: Pick<BallotRecord, "rank1EntryId" | "rank2EntryId" | "rank3EntryId">): string[] {
    return [ballot.rank1EntryId, ballot.rank2EntryId, ballot.rank3EntryId].filter((pick): pick is string => pick !== null);
}

export class BallotsService {
    public constructor(
        private readonly database: Database,
        private readonly store: KeyValueStore,
        private readonly eventBus: EventBus,
        private readonly notifier: Notifier,
        private readonly raidMonitor: RaidMonitor,
        private readonly pseudonymKey: string
    ) {}

    public async cast(voter: AuthenticatedUser, roundId: string, picks: readonly string[]): Promise<BallotRecord> {
        if (voter.isBlacklisted) {
            await this.reportBlockedBallot(voter, roundId);
            throw new ForbiddenError("Your account is blacklisted from voting.", ErrorCode.UserBlacklisted);
        }

        const { ballot, roundTitle, pollType, titles } = await this.database.transaction(async (transaction) => {
            const [round] = await transaction.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1).for("share");
            if (round === undefined) {
                throw new NotFoundError("Round");
            }
            if (!isAcceptingVotes(round)) {
                throw new ConflictError("This round is not accepting votes.", ErrorCode.RoundNotOpen);
            }

            const eligible = await transaction
                .select({ id: entries.id, title: entries.title })
                .from(entries)
                .where(and(eq(entries.roundId, roundId), eq(entries.status, EntryStatus.Approved), eq(entries.isQuarantined, false)));
            const scheme = getScoringScheme(round.pollType);
            const validation = validateBallot({ voterId: voter.id, picks }, scheme, new Set(eligible.map((entry) => entry.id)));
            if (!validation.isValid) {
                throw new UnprocessableError(
                    "The ballot was rejected.",
                    ErrorCode.BallotRejected,
                    validation.violations.map((violation) => ({
                        code: violation.code,
                        message: violation.message,
                        ...(violation.position === undefined ? {} : { path: `body.picks.${violation.position}` })
                    }))
                );
            }

            const values = {
                rank1EntryId: picks[0] ?? "",
                rank2EntryId: picks[1] ?? null,
                rank3EntryId: picks[2] ?? null
            };
            const [saved] = await transaction
                .insert(ballots)
                .values({ roundId, voterId: voter.id, ...values })
                .onConflictDoUpdate({ target: [ballots.roundId, ballots.voterId], set: { ...values, updatedAt: new Date() } })
                .returning();
            if (saved === undefined) {
                throw new Error("Ballot upsert returned no row.");
            }
            return {
                ballot: saved,
                roundTitle: round.title,
                pollType: round.pollType,
                titles: new Map(eligible.map((entry) => [entry.id, entry.title]))
            };
        });

        this.raidMonitor.schedule(roundId, picks);
        await this.eventBus.publish({
            type: RoundEventType.BallotSubmitted,
            roundId,
            entryIds: [...picks],
            occurredAt: new Date().toISOString()
        });
        if (!(await this.store.setIfAbsent(`ballot-notice:${voter.id}:${roundId}`, "1", ballotNoticeTtlSeconds))) {
            return ballot;
        }
        this.notifier.notify({
            type: NotificationType.BallotSubmitted,
            round: { id: roundId, title: roundTitle, pollType },
            voter: personOfUser(voter),
            picks: picks.map((pick) => ({ id: pick, title: titles.get(pick) ?? pick })),
            isChange: ballot.createdAt.getTime() !== ballot.updatedAt.getTime()
        });
        return ballot;
    }

    public async getOwn(voterId: string, roundId: string): Promise<BallotRecord> {
        const [ballot] = await this.database
            .select()
            .from(ballots)
            .where(and(eq(ballots.roundId, roundId), eq(ballots.voterId, voterId)))
            .limit(1);
        if (ballot === undefined) {
            throw new NotFoundError("Ballot");
        }
        return ballot;
    }

    public async ledger(roundId: string, query: PaginationQuery, viewer: AuthenticatedUser | null = null): Promise<Page<LedgerRow>> {
        const [round] = await this.database
            .select({ id: votingRounds.id, status: votingRounds.status })
            .from(votingRounds)
            .where(eq(votingRounds.id, roundId))
            .limit(1);
        if (round === undefined || (round.status === RoundStatus.Draft && !canSeeDrafts(viewer))) {
            throw new NotFoundError("Round");
        }
        const filter = and(eq(ballots.roundId, roundId), eq(users.isBlacklisted, false));
        const [rows, totals] = await Promise.all([
            this.database
                .select({
                    voterId: ballots.voterId,
                    rank1EntryId: ballots.rank1EntryId,
                    rank2EntryId: ballots.rank2EntryId,
                    rank3EntryId: ballots.rank3EntryId,
                    createdAt: ballots.createdAt,
                    updatedAt: ballots.updatedAt
                })
                .from(ballots)
                .innerJoin(users, eq(users.id, ballots.voterId))
                .where(filter)
                .orderBy(asc(ballots.createdAt), asc(ballots.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(ballots).innerJoin(users, eq(users.id, ballots.voterId)).where(filter)
        ]);
        return createPage(
            rows.map((row) => ({
                voter: hmacHex(this.pseudonymKey, `${roundId}:${row.voterId}`, 32),
                picks: picksOf(row),
                castAt: row.createdAt,
                updatedAt: row.updatedAt
            })),
            totals[0]?.total ?? 0,
            query
        );
    }

    private async reportBlockedBallot(voter: AuthenticatedUser, roundId: string): Promise<void> {
        const [round] = await this.database
            .select({ id: votingRounds.id, title: votingRounds.title, pollType: votingRounds.pollType })
            .from(votingRounds)
            .where(eq(votingRounds.id, roundId))
            .limit(1);
        const [record] = await this.database.select({ reason: users.blacklistReason }).from(users).where(eq(users.id, voter.id)).limit(1);
        if (round === undefined || !(await this.store.setIfAbsent(`ballot-blocked:${voter.id}:${roundId}`, "1", blockedNoticeTtlSeconds))) {
            return;
        }
        this.notifier.notify({
            type: NotificationType.BallotBlocked,
            round: roundReferenceOf(round),
            voter: personOfUser(voter),
            reason: record?.reason ?? null
        });
    }
}
