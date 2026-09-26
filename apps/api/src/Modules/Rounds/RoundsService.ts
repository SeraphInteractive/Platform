import { and, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { ConflictError, ErrorCode, NotFoundError, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, toIso, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor, AuthenticatedUser, UserActor } from "../../Common/Security/Principal.js";
import { canSeeDrafts } from "./RoundVisibility.js";
import { EntryStatus, type PollType, RoundStatus } from "../../Domain/Enums.js";
import type { Database, DatabaseExecutor } from "../../Infrastructure/Database/Database.js";
import { ballots, entries, users, votingRounds, type VotingRoundRecord } from "../../Infrastructure/Database/Schema.js";
import { NotificationType, personOfActor, roundReferenceOf, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";

export interface RoundListQuery extends PaginationQuery {
    readonly status?: RoundStatus;
}

export interface CreateRoundInput {
    readonly title: string;
    readonly pollType: PollType;
    readonly opensAt: Date | null;
    readonly closesAt: Date | null;
}

export interface UpdateRoundInput {
    readonly title?: string;
    readonly pollType?: PollType;
    readonly status?: RoundStatus.Draft | RoundStatus.Open | RoundStatus.Closed;
    readonly opensAt?: Date | null;
    readonly closesAt?: Date | null;
}

export interface RoundDetail {
    readonly round: VotingRoundRecord;
    readonly eligibleEntryCount: number;
    readonly ballotCount: number;
    readonly warnings: readonly string[];
}

const allowedTransitions: Readonly<Record<RoundStatus, readonly RoundStatus[]>> = {
    [RoundStatus.Draft]: [RoundStatus.Open, RoundStatus.Closed],
    [RoundStatus.Open]: [RoundStatus.Closed],
    [RoundStatus.Closed]: [RoundStatus.Open],
    [RoundStatus.Finalized]: []
};

const recommendedMaximumEntries = 5;

export class RoundsService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly leaderboardCache: LeaderboardCache
    ) {}

    public async list(query: RoundListQuery, viewer: AuthenticatedUser | null): Promise<Page<VotingRoundRecord>> {
        const conditions: SQL[] = [];
        if (query.status !== undefined) {
            conditions.push(eq(votingRounds.status, query.status));
        }
        if (!canSeeDrafts(viewer)) {
            conditions.push(ne(votingRounds.status, RoundStatus.Draft));
        }
        const filter = conditions.length === 0 ? undefined : and(...conditions);
        const [rows, totals] = await Promise.all([
            this.database
                .select()
                .from(votingRounds)
                .where(filter)
                .orderBy(desc(votingRounds.createdAt), desc(votingRounds.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(votingRounds).where(filter)
        ]);
        return createPage(rows, totals[0]?.total ?? 0, query);
    }

    public async require(roundId: string, executor: DatabaseExecutor = this.database): Promise<VotingRoundRecord> {
        const [round] = await executor.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1);
        if (round === undefined) {
            throw new NotFoundError("Round");
        }
        return round;
    }

    public async getDetail(roundId: string, viewer: AuthenticatedUser | null): Promise<RoundDetail> {
        const round = await this.require(roundId);
        if (round.status === RoundStatus.Draft && !canSeeDrafts(viewer)) {
            throw new NotFoundError("Round");
        }
        const [entryTotals, ballotTotals] = await Promise.all([
            this.database
                .select({ total: count() })
                .from(entries)
                .where(and(eq(entries.roundId, roundId), eq(entries.status, EntryStatus.Approved), eq(entries.isQuarantined, false))),
            this.database
                .select({ total: count() })
                .from(ballots)
                .innerJoin(users, eq(users.id, ballots.voterId))
                .where(and(eq(ballots.roundId, roundId), eq(users.isBlacklisted, false)))
        ]);
        const eligibleEntryCount = entryTotals[0]?.total ?? 0;
        const warnings =
            eligibleEntryCount > recommendedMaximumEntries
                ? [
                      `Round has more than ${recommendedMaximumEntries} options. Community guidelines recommend ${recommendedMaximumEntries} or fewer.`
                  ]
                : [];
        return { round, eligibleEntryCount, ballotCount: ballotTotals[0]?.total ?? 0, warnings };
    }

    public async create(actor: UserActor, input: CreateRoundInput): Promise<VotingRoundRecord> {
        this.assertWindow(input.opensAt, input.closesAt);
        const [round] = await this.database
            .insert(votingRounds)
            .values({
                title: input.title,
                pollType: input.pollType,
                opensAt: input.opensAt,
                closesAt: input.closesAt,
                createdBy: actor.userId
            })
            .returning();
        if (round === undefined) {
            throw new Error("Round insert returned no row.");
        }
        this.notifier.notify({
            type: NotificationType.RoundCreated,
            round: roundReferenceOf(round),
            actor: personOfActor(actor),
            opensAt: toIso(round.opensAt),
            closesAt: toIso(round.closesAt)
        });
        return round;
    }

    public async update(actor: Actor, roundId: string, input: UpdateRoundInput): Promise<VotingRoundRecord> {
        const { before, after } = await this.database.transaction(async (transaction) => {
            const [current] = await transaction.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1).for("update");
            if (current === undefined) {
                throw new NotFoundError("Round");
            }
            if (current.status === RoundStatus.Finalized) {
                throw new ConflictError("Finalized rounds cannot be modified.", ErrorCode.RoundFinalized);
            }
            if (
                input.status !== undefined &&
                input.status !== current.status &&
                !allowedTransitions[current.status].includes(input.status)
            ) {
                throw new ConflictError(
                    `A round cannot move from ${current.status} to ${input.status}.`,
                    ErrorCode.InvalidStatusTransition
                );
            }
            if (input.pollType !== undefined && input.pollType !== current.pollType && current.status !== RoundStatus.Draft) {
                throw new ConflictError("The poll type can only be changed while the round is a draft.", ErrorCode.InvalidStatusTransition);
            }
            const opensAt = input.opensAt === undefined ? current.opensAt : input.opensAt;
            const closesAt = input.closesAt === undefined ? current.closesAt : input.closesAt;
            this.assertWindow(opensAt, closesAt);

            const [updated] = await transaction
                .update(votingRounds)
                .set({
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.pollType === undefined ? {} : { pollType: input.pollType }),
                    ...(input.status === undefined ? {} : { status: input.status }),
                    opensAt,
                    closesAt
                })
                .where(eq(votingRounds.id, roundId))
                .returning();
            if (updated === undefined) {
                throw new NotFoundError("Round");
            }
            return { before: current, after: updated };
        });

        await this.leaderboardCache.invalidateRound(roundId);
        if (before.status !== after.status) {
            this.notifier.notify({
                type: NotificationType.RoundStatusChanged,
                round: roundReferenceOf(after),
                from: before.status,
                to: after.status,
                actor: personOfActor(actor)
            });
        }
        return after;
    }

    public async delete(roundId: string): Promise<void> {
        await this.database.transaction(async (transaction) => {
            const [current] = await transaction.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1).for("update");
            if (current === undefined) {
                throw new NotFoundError("Round");
            }
            if (current.status === RoundStatus.Finalized) {
                throw new ConflictError(
                    "Finalized rounds are part of the permanent record and cannot be deleted.",
                    ErrorCode.RoundFinalized
                );
            }
            await transaction.delete(votingRounds).where(eq(votingRounds.id, roundId));
        });
        await this.leaderboardCache.invalidateRound(roundId);
    }

    private assertWindow(opensAt: Date | null, closesAt: Date | null): void {
        if (opensAt !== null && closesAt !== null && closesAt.getTime() <= opensAt.getTime()) {
            throw new UnprocessableError("closesAt must be later than opensAt.", ErrorCode.ValidationFailed, [
                { path: "body.closesAt", message: "must be later than opensAt" }
            ]);
        }
    }
}
