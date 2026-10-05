import { and, count, desc, eq, type SQL } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor, AuthenticatedUser } from "../../Common/Security/Principal.js";
import { EntryStatus, RoundStatus } from "../../Domain/Enums.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import type { StorageConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { isForeignKeyViolation, type Database, type Transaction } from "../../Infrastructure/Database/Database.js";
import { entries, users, votingRounds, type EntryRecord, type VotingRoundRecord } from "../../Infrastructure/Database/Schema.js";
import {
    NotificationType,
    personOfActor,
    personOfUser,
    roundReferenceOf,
    type Notifier
} from "../../Infrastructure/Notifications/Notification.js";
import type { ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";
import { canSeeDrafts } from "../Rounds/RoundVisibility.js";
import { assertUploadedMedia } from "../Uploads/MediaPolicy.js";

export interface EntryListQuery extends PaginationQuery {
    readonly status?: EntryStatus;
}

export interface CreateEntryInput {
    readonly title: string;
    readonly description: string | null;
    readonly mediaKey: string | null;
}

export interface UpdateEntryInput {
    readonly title?: string;
    readonly description?: string | null;
    readonly mediaKey?: string | null;
}

const submissionStatuses: readonly RoundStatus[] = [RoundStatus.Draft, RoundStatus.Open];

export class EntriesService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly storage: ObjectStorage,
        private readonly storageConfiguration: StorageConfiguration,
        private readonly leaderboardCache: LeaderboardCache
    ) {}

    public async list(roundId: string, query: EntryListQuery, viewer: AuthenticatedUser | null): Promise<Page<EntryRecord>> {
        const round = await this.requireRound(this.database, roundId);
        if (round.status === RoundStatus.Draft && !canSeeDrafts(viewer)) {
            throw new NotFoundError("Round");
        }
        const isStaff = viewer !== null && hasAtLeast(viewer.role, Role.Moderator);
        const conditions: SQL[] = [eq(entries.roundId, roundId)];
        if (!isStaff) {
            conditions.push(eq(entries.status, EntryStatus.Approved), eq(entries.isQuarantined, false));
        } else if (query.status !== undefined) {
            conditions.push(eq(entries.status, query.status));
        }
        const filter = and(...conditions);
        const [rows, totals] = await Promise.all([
            this.database
                .select()
                .from(entries)
                .where(filter)
                .orderBy(desc(entries.createdAt), desc(entries.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(entries).where(filter)
        ]);
        return createPage(rows, totals[0]?.total ?? 0, query);
    }

    public async get(roundId: string, entryId: string, viewer: AuthenticatedUser | null): Promise<EntryRecord> {
        const round = await this.requireRound(this.database, roundId);
        const entry = await this.requireEntry(this.database, roundId, entryId);
        const isVisible =
            (entry.status === EntryStatus.Approved &&
                !entry.isQuarantined &&
                (round.status !== RoundStatus.Draft || canSeeDrafts(viewer))) ||
            (viewer !== null && (hasAtLeast(viewer.role, Role.Moderator) || entry.submittedBy === viewer.id));
        if (!isVisible) {
            throw new NotFoundError("Entry");
        }
        return entry;
    }

    public async create(author: AuthenticatedUser, roundId: string, input: CreateEntryInput): Promise<EntryRecord> {
        if (author.isBlacklisted) {
            throw new ForbiddenError("Your account is blacklisted from participating in rounds.", ErrorCode.UserBlacklisted);
        }
        if (input.mediaKey !== null) {
            await assertUploadedMedia(this.storage, input.mediaKey, author.id, this.storageConfiguration.mediaMaxBytes);
        }
        const isStaff = hasAtLeast(author.role, Role.Supervisor);
        const { entry, round } = await this.database.transaction(async (transaction) => {
            const lockedRound = await this.requireRound(transaction, roundId, true);
            if (!submissionStatuses.includes(lockedRound.status)) {
                throw new ConflictError("This round is no longer accepting entries.", ErrorCode.RoundNotOpen);
            }
            const [created] = await transaction
                .insert(entries)
                .values({
                    roundId,
                    title: input.title,
                    description: input.description,
                    mediaKey: input.mediaKey,
                    submittedBy: author.id,
                    status: isStaff ? EntryStatus.Approved : EntryStatus.PendingReview
                })
                .returning();
            if (created === undefined) {
                throw new Error("Entry insert returned no row.");
            }
            return { entry: created, round: lockedRound };
        });

        if (entry.status === EntryStatus.Approved) {
            await this.leaderboardCache.invalidateRound(roundId);
        }
        this.notifier.notify({
            type: NotificationType.EntrySubmitted,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title },
            status: entry.status,
            author: personOfUser(author)
        });
        return entry;
    }

    public async update(roundId: string, entryId: string, input: UpdateEntryInput): Promise<EntryRecord> {
        if (input.mediaKey !== undefined && input.mediaKey !== null) {
            await assertUploadedMedia(this.storage, input.mediaKey, null, this.storageConfiguration.mediaMaxBytes);
        }
        const entry = await this.mutate(roundId, entryId, async (transaction) => {
            const [updated] = await transaction
                .update(entries)
                .set({
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.description === undefined ? {} : { description: input.description }),
                    ...(input.mediaKey === undefined ? {} : { mediaKey: input.mediaKey })
                })
                .where(eq(entries.id, entryId))
                .returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        return entry.entry;
    }

    public async setStatus(actor: Actor, roundId: string, entryId: string, status: EntryStatus): Promise<EntryRecord> {
        const { entry, round } = await this.mutate(roundId, entryId, async (transaction) => {
            const [updated] = await transaction.update(entries).set({ status }).where(eq(entries.id, entryId)).returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        const author = await this.authorOf(entry);
        this.notifier.notify({
            type: NotificationType.EntryStatusChanged,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title },
            status,
            author: author === null ? null : personOfUser(author),
            actor: personOfActor(actor)
        });
        return entry;
    }

    public async reinstate(actor: Actor, roundId: string, entryId: string): Promise<EntryRecord> {
        const { entry, round } = await this.mutate(roundId, entryId, async (transaction) => {
            const [updated] = await transaction
                .update(entries)
                .set({ status: EntryStatus.Approved, isQuarantined: false })
                .where(eq(entries.id, entryId))
                .returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        this.notifier.notify({
            type: NotificationType.EntryReinstated,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title },
            actor: personOfActor(actor)
        });
        return entry;
    }

    public async delete(roundId: string, entryId: string): Promise<void> {
        try {
            await this.mutate(roundId, entryId, async (transaction) => {
                const [deleted] = await transaction.delete(entries).where(eq(entries.id, entryId)).returning();
                return deleted;
            });
        } catch (error: unknown) {
            if (isForeignKeyViolation(error)) {
                throw new ConflictError(
                    "Entries that have received votes cannot be deleted. Reject the entry instead.",
                    ErrorCode.EntryHasBallots
                );
            }
            throw error;
        }
        await this.leaderboardCache.invalidateRound(roundId);
    }

    private async authorOf(entry: EntryRecord): Promise<{ discordId: string; discordUsername: string } | null> {
        if (entry.submittedBy === null) {
            return null;
        }
        const [author] = await this.database
            .select({ discordId: users.discordId, discordUsername: users.discordUsername })
            .from(users)
            .where(eq(users.id, entry.submittedBy))
            .limit(1);
        return author ?? null;
    }

    private async mutate(
        roundId: string,
        entryId: string,
        operation: (transaction: Transaction) => Promise<EntryRecord | undefined>
    ): Promise<{ entry: EntryRecord; round: VotingRoundRecord }> {
        return this.database.transaction(async (transaction) => {
            const round = await this.requireRound(transaction, roundId, true);
            if (round.status === RoundStatus.Finalized) {
                throw new ConflictError("Entries of a finalized round cannot be changed.", ErrorCode.RoundFinalized);
            }
            await this.requireEntry(transaction, roundId, entryId);
            const entry = await operation(transaction);
            if (entry === undefined) {
                throw new NotFoundError("Entry");
            }
            return { entry, round };
        });
    }

    private async requireRound(executor: Database | Transaction, roundId: string, lock = false): Promise<VotingRoundRecord> {
        const query = executor.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1);
        const [round] = lock ? await query.for("share") : await query;
        if (round === undefined) {
            throw new NotFoundError("Round");
        }
        return round;
    }

    private async requireEntry(executor: Database | Transaction, roundId: string, entryId: string): Promise<EntryRecord> {
        const [entry] = await executor
            .select()
            .from(entries)
            .where(and(eq(entries.id, entryId), eq(entries.roundId, roundId)))
            .limit(1);
        if (entry === undefined) {
            throw new NotFoundError("Entry");
        }
        return entry;
    }
}
