import { validateRoundWindow } from "@platform/contracts";
import { and, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, toIso, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor, AuthenticatedUser, UserActor } from "../../Common/Security/Principal.js";
import { canSeeDrafts } from "./RoundVisibility.js";
import { EntryStatus, PollType, RoundStatus } from "../../Domain/Enums.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
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
    readonly status?: RoundStatus.Draft | RoundStatus.Open | RoundStatus.Voting;
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
    [RoundStatus.Draft]: [RoundStatus.Open],
    [RoundStatus.Open]: [RoundStatus.Voting],
    [RoundStatus.Voting]: [RoundStatus.Finalized],
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
        this.assertCanInitiate(actor, input.pollType);
        this.assertWindow(input.opensAt, input.closesAt, true);
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
                    `A round cannot move from ${current.status} to ${input.status}. Backtracking round states is not allowed.`,
                    ErrorCode.InvalidStatusTransition
                );
            }
            if (input.status === RoundStatus.Voting && current.status === RoundStatus.Open) {
                const [approvedCount] = await transaction
                    .select({ total: count() })
                    .from(entries)
                    .where(and(eq(entries.roundId, roundId), eq(entries.status, EntryStatus.Approved), eq(entries.isQuarantined, false)));
                const totalApproved = approvedCount?.total ?? 0;
                if (current.pollType === PollType.Binary && totalApproved !== 2) {
                    throw new ConflictError(
                        "A binary round requires exactly 2 approved entries to proceed to voting.",
                        ErrorCode.Conflict
                    );
                }
                if (current.pollType === PollType.RankedChoice && (totalApproved < 2 || totalApproved > 5)) {
                    throw new ConflictError(
                        "A ranked-choice round requires between 2 and 5 approved entries to proceed to voting.",
                        ErrorCode.Conflict
                    );
                }
            }
            if (input.pollType !== undefined && input.pollType !== current.pollType) {
                if (current.status !== RoundStatus.Draft) {
                    throw new ConflictError(
                        "The poll type can only be changed while the round is a draft.",
                        ErrorCode.InvalidStatusTransition
                    );
                }
                this.assertCanInitiate(actor, input.pollType);
            }
            if (
                input.opensAt !== undefined &&
                current.status !== RoundStatus.Draft &&
                input.opensAt?.getTime() !== current.opensAt?.getTime()
            ) {
                throw new ConflictError("Start date cannot be modified once a round leaves draft.", ErrorCode.InvalidStatusTransition);
            }
            const opensAt = input.opensAt === undefined ? current.opensAt : input.opensAt;
            const closesAt = input.closesAt === undefined ? current.closesAt : input.closesAt;
            this.assertWindow(opensAt, closesAt, current.status === RoundStatus.Draft);

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
        const metadataChanged =
            before.title !== after.title ||
            before.pollType !== after.pollType ||
            before.opensAt?.getTime() !== after.opensAt?.getTime() ||
            before.closesAt?.getTime() !== after.closesAt?.getTime();

        if (metadataChanged) {
            this.notifier.notify({
                type: NotificationType.RoundUpdated,
                round: roundReferenceOf(after),
                actor: personOfActor(actor),
                opensAt: toIso(after.opensAt),
                closesAt: toIso(after.closesAt)
            });
        }
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

    public async delete(actor: Actor, roundId: string): Promise<void> {
        let deletedRound: VotingRoundRecord | undefined;
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
            deletedRound = current;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        if (deletedRound !== undefined) {
            this.notifier.notify({
                type: NotificationType.RoundDeleted,
                round: roundReferenceOf(deletedRound),
                actor: personOfActor(actor)
            });
        }
    }

    private assertCanInitiate(actor: Actor, pollType: PollType): void {
        if (pollType === PollType.Binary && !hasAtLeast(actor.role, Role.Admin)) {
            throw new ForbiddenError("Binary voting rounds can only be initiated by administrators.");
        }
    }

    private assertWindow(opensAt: Date | null, closesAt: Date | null, isDraft: boolean): void {
        const problem = validateRoundWindow(opensAt, closesAt, { isDraft });
        if (problem !== null) {
            throw new UnprocessableError(problem, ErrorCode.ValidationFailed, [{ path: "body.closesAt", message: problem }]);
        }
    }
}
