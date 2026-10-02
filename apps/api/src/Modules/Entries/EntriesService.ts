import { and, count, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { Actor, AuthenticatedUser } from "../../Common/Security/Principal.js";
import { EntryStatus, PollType, RoundStatus } from "../../Domain/Enums.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import type { StorageConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { isForeignKeyViolation, type Database, type Transaction } from "../../Infrastructure/Database/Database.js";
import {
    deletedStorageObjects,
    entries,
    users,
    votingRounds,
    type EntryRecord,
    type VotingRoundRecord
} from "../../Infrastructure/Database/Schema.js";
import {
    NotificationType,
    personOfActor,
    personOfUser,
    roundReferenceOf,
    type Notifier
} from "../../Infrastructure/Notifications/Notification.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";
import { canSeeDrafts } from "../Rounds/RoundVisibility.js";
import { inspectMediaAiSignatures } from "../Uploads/AiMetadataDetector.js";
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

const submissionStatuses: readonly RoundStatus[] = [RoundStatus.Open];
const maxApprovedEntriesPerRound = 5;

export interface EntryWithAuthor {
    readonly entry: EntryRecord;
    readonly author: {
        readonly id: string;
        readonly discordId: string | null;
        readonly discordUsername: string;
        readonly discordAvatar: string | null;
    } | null;
}

const authorColumns = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar
};

export class EntriesService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly storage: ObjectStorage,
        private readonly storageConfiguration: StorageConfiguration,
        private readonly leaderboardCache: LeaderboardCache
    ) {}

    public async list(roundId: string, query: EntryListQuery, viewer: AuthenticatedUser | null): Promise<Page<EntryWithAuthor>> {
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
                .select({ entry: entries, author: authorColumns })
                .from(entries)
                .leftJoin(users, eq(users.id, entries.submittedBy))
                .where(filter)
                .orderBy(desc(entries.createdAt), desc(entries.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(entries).where(filter)
        ]);
        return createPage(rows, totals[0]?.total ?? 0, query);
    }

    public async get(roundId: string, entryId: string, viewer: AuthenticatedUser | null): Promise<EntryWithAuthor> {
        const round = await this.requireRound(this.database, roundId);
        const [row] = await this.database
            .select({ entry: entries, author: authorColumns })
            .from(entries)
            .leftJoin(users, eq(users.id, entries.submittedBy))
            .where(and(eq(entries.roundId, roundId), eq(entries.id, entryId)))
            .limit(1);
        if (row === undefined) {
            throw new NotFoundError("Entry");
        }
        const isVisible =
            (row.entry.status === EntryStatus.Approved &&
                !row.entry.isQuarantined &&
                (round.status !== RoundStatus.Draft || canSeeDrafts(viewer))) ||
            (viewer !== null && (hasAtLeast(viewer.role, Role.Moderator) || row.entry.submittedBy === viewer.id));
        if (!isVisible) {
            throw new NotFoundError("Entry");
        }
        return row;
    }

    public async listByAuthor(userId: string): Promise<EntryWithAuthor[]> {
        return this.database
            .select({ entry: entries, author: authorColumns })
            .from(entries)
            .leftJoin(users, eq(users.id, entries.submittedBy))
            .where(eq(entries.submittedBy, userId))
            .orderBy(desc(entries.createdAt));
    }

    public async create(author: AuthenticatedUser, roundId: string, input: CreateEntryInput): Promise<EntryRecord> {
        if (author.isBlacklisted) {
            throw new ForbiddenError("Your account is blacklisted from participating in rounds.", ErrorCode.UserBlacklisted);
        }
        let aiFlags: string[] = [];
        let aiSnippet: string | null = null;
        if (input.mediaKey !== null) {
            await assertUploadedMedia(this.storage, input.mediaKey, author.id, this.storageConfiguration.mediaMaxBytes);
            const buffer = await this.storage.getObject(StorageBucket.Media, input.mediaKey, 524288);
            const detection = inspectMediaAiSignatures(buffer);
            if (detection.flagged) {
                aiFlags = [...detection.flags];
                aiSnippet = detection.snippet;
            }
        }
        const { entry, round } = await this.database.transaction(async (transaction) => {
            const lockedRound = await this.requireRound(transaction, roundId, true);
            if (!submissionStatuses.includes(lockedRound.status)) {
                throw new ConflictError("Entries can only be submitted once the round is open.", ErrorCode.RoundNotOpen);
            }
            if (lockedRound.pollType === PollType.Binary && !hasAtLeast(author.role, Role.Supervisor)) {
                throw new ForbiddenError("Binary rounds do not accept public proposals.", ErrorCode.Forbidden);
            }
            if (!hasAtLeast(author.role, Role.Supervisor)) {
                const [existingActive] = await transaction
                    .select({ id: entries.id })
                    .from(entries)
                    .where(
                        and(
                            eq(entries.roundId, roundId),
                            eq(entries.submittedBy, author.id),
                            inArray(entries.status, [EntryStatus.PendingReview, EntryStatus.Approved])
                        )
                    )
                    .limit(1);
                if (existingActive !== undefined) {
                    throw new ConflictError("You already have an active entry for this round.", ErrorCode.Conflict);
                }
            }
            const [created] = await transaction
                .insert(entries)
                .values({
                    roundId,
                    title: input.title,
                    description: input.description,
                    mediaKey: input.mediaKey,
                    submittedBy: author.id,
                    status: EntryStatus.PendingReview,
                    aiFlags
                })
                .returning();
            if (created === undefined) {
                throw new Error("Entry insert returned no row.");
            }
            return { entry: created, round: lockedRound };
        });

        const mediaUrl = entry.mediaKey === null ? null : this.storage.getPublicUrl(StorageBucket.Media, entry.mediaKey);

        this.notifier.notify({
            type: NotificationType.EntrySubmitted,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title, mediaUrl },
            status: entry.status,
            author: personOfUser(author)
        });

        if (aiFlags.length > 0) {
            this.notifier.notify({
                type: NotificationType.MediaFlaggedAi,
                mediaKind: "entry",
                targetId: entry.id,
                title: entry.title,
                author: personOfUser(author),
                flags: aiFlags,
                snippet: aiSnippet
            });
        }
        return entry;
    }

    public async update(actor: Actor, roundId: string, entryId: string, input: UpdateEntryInput): Promise<EntryRecord> {
        let aiFlags: string[] | undefined = undefined;
        let aiSnippet: string | null = null;
        if (input.mediaKey !== undefined) {
            if (input.mediaKey !== null) {
                await assertUploadedMedia(this.storage, input.mediaKey, null, this.storageConfiguration.mediaMaxBytes);
                const buffer = await this.storage.getObject(StorageBucket.Media, input.mediaKey, 524288);
                const detection = inspectMediaAiSignatures(buffer);
                aiFlags = [...detection.flags];
                aiSnippet = detection.snippet;
            } else {
                aiFlags = [];
            }
        }
        const { entry, round } = await this.mutate(roundId, entryId, async (transaction) => {
            const [updated] = await transaction
                .update(entries)
                .set({
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.description === undefined ? {} : { description: input.description }),
                    ...(input.mediaKey === undefined ? {} : { mediaKey: input.mediaKey }),
                    ...(aiFlags === undefined ? {} : { aiFlags })
                })
                .where(eq(entries.id, entryId))
                .returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        const mediaUrl = entry.mediaKey === null ? null : this.storage.getPublicUrl(StorageBucket.Media, entry.mediaKey);
        this.notifier.notify({
            type: NotificationType.EntryUpdated,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title, mediaUrl },
            actor: personOfActor(actor)
        });

        if (aiFlags !== undefined && aiFlags.length > 0) {
            const author = await this.authorOf(entry);
            this.notifier.notify({
                type: NotificationType.MediaFlaggedAi,
                mediaKind: "entry",
                targetId: entry.id,
                title: entry.title,
                author: author === null ? personOfActor(actor) : { discordId: author.discordId, username: author.discordUsername },
                flags: aiFlags,
                snippet: aiSnippet
            });
        }
        return entry;
    }

    public async setStatus(actor: Actor, roundId: string, entryId: string, status: EntryStatus): Promise<EntryRecord> {
        const { entry, round } = await this.mutate(roundId, entryId, async (transaction) => {
            if (status === EntryStatus.Approved) {
                const [approvedCount] = await transaction
                    .select({ total: count() })
                    .from(entries)
                    .where(and(eq(entries.roundId, roundId), eq(entries.status, EntryStatus.Approved), ne(entries.id, entryId)));
                if ((approvedCount?.total ?? 0) >= maxApprovedEntriesPerRound) {
                    throw new ConflictError(
                        `A round can have a maximum of ${maxApprovedEntriesPerRound} approved entries.`,
                        ErrorCode.Conflict
                    );
                }
            }
            const [updated] = await transaction.update(entries).set({ status }).where(eq(entries.id, entryId)).returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        const author = await this.authorOf(entry);
        const mediaUrl = entry.mediaKey === null ? null : this.storage.getPublicUrl(StorageBucket.Media, entry.mediaKey);
        this.notifier.notify({
            type: NotificationType.EntryStatusChanged,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title, mediaUrl },
            status,
            author: author === null ? null : personOfUser(author),
            actor: personOfActor(actor)
        });
        return entry;
    }

    public async reinstate(actor: Actor, roundId: string, entryId: string): Promise<EntryRecord> {
        const { entry, round } = await this.mutate(roundId, entryId, async (transaction) => {
            const [approvedCount] = await transaction
                .select({ total: count() })
                .from(entries)
                .where(and(eq(entries.roundId, roundId), eq(entries.status, EntryStatus.Approved), ne(entries.id, entryId)));
            if ((approvedCount?.total ?? 0) >= maxApprovedEntriesPerRound) {
                throw new ConflictError(
                    `A round can have a maximum of ${maxApprovedEntriesPerRound} approved entries.`,
                    ErrorCode.Conflict
                );
            }
            const [updated] = await transaction
                .update(entries)
                .set({ status: EntryStatus.Approved, isQuarantined: false })
                .where(eq(entries.id, entryId))
                .returning();
            return updated;
        });
        await this.leaderboardCache.invalidateRound(roundId);
        const mediaUrl = entry.mediaKey === null ? null : this.storage.getPublicUrl(StorageBucket.Media, entry.mediaKey);
        this.notifier.notify({
            type: NotificationType.EntryReinstated,
            round: roundReferenceOf(round),
            entry: { id: entry.id, title: entry.title, mediaUrl },
            actor: personOfActor(actor)
        });
        return entry;
    }

    public async delete(actor: Actor, roundId: string, entryId: string): Promise<void> {
        let deletedEntry: EntryRecord | undefined;
        let parentRound: VotingRoundRecord | undefined;
        try {
            const result = await this.mutate(roundId, entryId, async (transaction) => {
                const [target] = await transaction.select().from(entries).where(eq(entries.id, entryId)).limit(1);
                const [deleted] = await transaction.delete(entries).where(eq(entries.id, entryId)).returning();
                return target ?? deleted;
            });
            deletedEntry = result.entry;
            parentRound = result.round;
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
        if (deletedEntry !== undefined && parentRound !== undefined) {
            if (deletedEntry.mediaKey !== null) {
                // hold orphaned media for 48h recovery buffer before bucket prune
                const scheduledDeleteAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
                await this.database.insert(deletedStorageObjects).values({
                    bucket: StorageBucket.Media,
                    objectKey: deletedEntry.mediaKey,
                    scheduledDeleteAt
                });
            }
            this.notifier.notify({
                type: NotificationType.EntryDeleted,
                round: roundReferenceOf(parentRound),
                entry: { id: deletedEntry.id, title: deletedEntry.title, mediaUrl: null },
                actor: personOfActor(actor)
            });
        }
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
