import { validateRoundWindow } from "@platform/contracts";
import { and, count, desc, eq, ne, type SQL } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, toIso, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor, AuthenticatedUser, UserActor } from "../../Common/Security/Principal.js";
import { canSeeDrafts } from "./RoundVisibility.js";
import { EntryStatus, PollType, RoundStatus } from "../../Domain/Enums.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import type { Database, DatabaseExecutor } from "../../Infrastructure/Database/Database.js";
import { ballots, entries, roundResults, users, votingRounds, type VotingRoundRecord } from "../../Infrastructure/Database/Schema.js";
import { NotificationType, personOfActor, roundReferenceOf, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";

export interface RoundListQuery extends PaginationQuery {
    readonly status?: RoundStatus;
}

export interface BinaryEntryInput {
    readonly title: string;
    readonly description?: string | null;
    readonly mediaKey?: string | null;
}

export interface BinaryEntryUpdateInput {
    readonly id?: string;
    readonly title: string;
    readonly description?: string | null;
    readonly mediaKey?: string | null;
}

export interface CreateRoundInput {
    readonly title: string;
    readonly pollType: PollType;
    readonly opensAt: Date | null;
    readonly closesAt: Date | null;
    readonly binaryEntries?: readonly [BinaryEntryInput, BinaryEntryInput];
}

export interface UpdateRoundInput {
    readonly title?: string;
    readonly pollType?: PollType;
    readonly status?: RoundStatus;
    readonly opensAt?: Date | null;
    readonly closesAt?: Date | null;
    readonly binaryEntries?: readonly [BinaryEntryUpdateInput, BinaryEntryUpdateInput];
}

export interface RoundDetail {
    readonly round: VotingRoundRecord;
    readonly eligibleEntryCount: number;
    readonly ballotCount: number;
    readonly warnings: readonly string[];
}

function isAllowedTransition(pollType: PollType, from: RoundStatus, to: RoundStatus): boolean {
    if (pollType === PollType.Binary) {
        if (from === RoundStatus.Draft && (to === RoundStatus.Voting || to === RoundStatus.Open)) return true;
        if (from === RoundStatus.Open && to === RoundStatus.Voting) return true;
        if (from === RoundStatus.Voting && to === RoundStatus.Finalized) return true;
        return false;
    }
    if (from === RoundStatus.Draft && to === RoundStatus.Open) return true;
    if (from === RoundStatus.Open && to === RoundStatus.Voting) return true;
    if (from === RoundStatus.Voting && to === RoundStatus.Finalized) return true;
    return false;
}

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
        if (input.pollType === PollType.Binary) {
            if (!input.binaryEntries || input.binaryEntries.length !== 2) {
                throw new UnprocessableError("Binary rounds require exactly 2 entries upon creation.", ErrorCode.ValidationFailed);
            }
        }
        const round = await this.database.transaction(async (transaction) => {
            const [created] = await transaction
                .insert(votingRounds)
                .values({
                    title: input.title,
                    pollType: input.pollType,
                    opensAt: input.opensAt,
                    closesAt: input.closesAt,
                    createdBy: actor.userId
                })
                .returning();
            if (created === undefined) {
                throw new Error("Round insert returned no row.");
            }
            if (input.pollType === PollType.Binary && input.binaryEntries) {
                for (const choice of input.binaryEntries) {
                    await transaction.insert(entries).values({
                        roundId: created.id,
                        title: choice.title,
                        description: choice.description ?? null,
                        mediaKey: choice.mediaKey ?? null,
                        submittedBy: actor.userId,
                        status: EntryStatus.Approved,
                        isQuarantined: false
                    });
                }
            }
            return created;
        });

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
            if (current.status === RoundStatus.Finalized && !hasAtLeast(actor.role, Role.Admin)) {
                throw new ConflictError("Finalized rounds cannot be modified.", ErrorCode.RoundFinalized);
            }
            if (
                input.status !== undefined &&
                input.status !== current.status &&
                !isAllowedTransition(current.pollType, current.status, input.status)
            ) {
                if (!hasAtLeast(actor.role, Role.Admin)) {
                    throw new ConflictError(
                        `A round cannot move from ${current.status} to ${input.status}. Backtracking round states is not allowed.`,
                        ErrorCode.InvalidStatusTransition
                    );
                }
            }
            if (current.status === RoundStatus.Finalized && input.status !== undefined && input.status !== RoundStatus.Finalized) {
                // remove stale certified results when un-finalizing
                await transaction.delete(roundResults).where(eq(roundResults.roundId, roundId));
            }
            if (input.status === RoundStatus.Voting && (current.status === RoundStatus.Open || current.status === RoundStatus.Draft)) {
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
                if (current.pollType === PollType.RankedChoice && totalApproved !== 5) {
                    throw new ConflictError(
                        "A ranked-choice round requires exactly 5 approved entries to proceed to voting.",
                        ErrorCode.Conflict
                    );
                }
            }
            if (input.pollType !== undefined && input.pollType !== current.pollType) {
                if (current.status !== RoundStatus.Draft && !hasAtLeast(actor.role, Role.Admin)) {
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
                if (!hasAtLeast(actor.role, Role.Admin)) {
                    throw new ConflictError("Start date cannot be modified once a round leaves draft.", ErrorCode.InvalidStatusTransition);
                }
            }
            const opensAt = input.opensAt === undefined ? current.opensAt : input.opensAt;
            const closesAt = input.closesAt === undefined ? current.closesAt : input.closesAt;
            this.assertWindow(opensAt, closesAt, current.status === RoundStatus.Draft || hasAtLeast(actor.role, Role.Admin));

            if (input.binaryEntries !== undefined) {
                if (current.pollType !== PollType.Binary) {
                    throw new ConflictError("Option pairs can only be updated for binary rounds.", ErrorCode.Conflict);
                }
                if (current.status === RoundStatus.Finalized && !hasAtLeast(actor.role, Role.Admin)) {
                    throw new ConflictError("Finalized rounds cannot be modified.", ErrorCode.RoundFinalized);
                }
                const currentEntries = await transaction
                    .select()
                    .from(entries)
                    .where(eq(entries.roundId, roundId))
                    .orderBy(entries.createdAt, entries.id);

                if (currentEntries.length === 2) {
                    for (let i = 0; i < 2; i++) {
                        const entryRecord = currentEntries[i];
                        const updateItem = input.binaryEntries[i];
                        if (entryRecord && updateItem) {
                            await transaction
                                .update(entries)
                                .set({
                                    title: updateItem.title,
                                    description: updateItem.description ?? null,
                                    ...(updateItem.mediaKey !== undefined ? { mediaKey: updateItem.mediaKey } : {})
                                })
                                .where(eq(entries.id, updateItem.id ?? entryRecord.id));
                        }
                    }
                }
            }

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
            if (current.status === RoundStatus.Finalized && !hasAtLeast(actor.role, Role.Admin)) {
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
        if (pollType === PollType.Binary && !hasAtLeast(actor.role, Role.Supervisor)) {
            throw new ForbiddenError("Binary voting rounds can only be initiated by supervisors and administrators.");
        }
    }

    private assertWindow(opensAt: Date | null, closesAt: Date | null, isDraft: boolean): void {
        const problem = validateRoundWindow(opensAt, closesAt, { isDraft });
        if (problem !== null) {
            throw new UnprocessableError(problem, ErrorCode.ValidationFailed, [{ path: "body.closesAt", message: problem }]);
        }
    }
}
