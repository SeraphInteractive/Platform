import { and, asc, count, desc, eq, inArray, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { StorageConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import {
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableError
} from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { AuthenticatedUser } from "../../Common/Security/Principal.js";
import { DeliverableKind, type DifficultyTier, ShotStatus } from "../../Domain/Enums.js";
import { hasAtLeast, rankOf, Role } from "../../Domain/Roles.js";
import { isUniqueViolation, type Database, type Transaction } from "../../Infrastructure/Database/Database.js";
import {
    deletedStorageObjects,
    shots,
    submissions,
    users,
    votingRounds,
    type ShotRecord,
    type SubmissionRecord,
    type UserRecord
} from "../../Infrastructure/Database/Schema.js";
import { NotificationType, personOfUser, shotReferenceOf, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import { StorageBucket, type ObjectStorage, type PresignedUpload } from "../../Infrastructure/Storage/ObjectStorage.js";
import {
    assertDeliverable,
    createDeliverableKey,
    deliverableContentTypes,
    sanitizeFileName,
    seniorPriorityTiers,
    tierDaysOf
} from "./DeliverablePolicy.js";
import { inspectMediaAiSignatures } from "../Uploads/AiMetadataDetector.js";

type UserSummaryRecord = Pick<UserRecord, "id" | "discordId" | "discordUsername" | "discordAvatar">;

export interface ShotListQuery extends PaginationQuery {
    readonly sceneNumber?: number;
    readonly difficultyTier?: DifficultyTier;
    readonly status?: ShotStatus;
}

export interface ShotListItem {
    readonly shot: ShotRecord;
    readonly claimer: UserSummaryRecord | null;
    readonly latestSubmission: Pick<SubmissionRecord, "version" | "status"> | null;
    readonly isSeniorLocked: boolean;
}

export interface SubmissionView {
    readonly submission: SubmissionRecord;
    readonly contributor: UserSummaryRecord | null;
    readonly reviewer: UserSummaryRecord | null;
    readonly videoUrl: string | null;
    readonly blendUrl: string | null;
}

export interface ShotDetail extends ShotListItem {
    readonly submissions: readonly SubmissionView[];
}

export interface CreateShotInput {
    readonly roundId: string | null;
    readonly sceneNumber: number;
    readonly shotCode: string;
    readonly title: string;
    readonly description: string | null;
    readonly difficultyTier: DifficultyTier;
    readonly seniorPriorityHours: number;
    readonly imageKeys?: readonly string[];
}

export interface UpdateShotInput {
    readonly roundId?: string | null;
    readonly sceneNumber?: number;
    readonly shotCode?: string;
    readonly title?: string;
    readonly description?: string | null;
    readonly difficultyTier?: DifficultyTier;
    readonly imageKeys?: readonly string[];
}

export interface DeliverableUploadInput {
    readonly kind: DeliverableKind;
    readonly fileName: string;
    readonly contentType: string;
    readonly sizeBytes: number;
}

export interface SubmitWorkInput {
    readonly videoKey: string;
    readonly blendKey: string | null;
    readonly notes: string | null;
}

export interface ReclaimResult {
    readonly reclaimedCount: number;
    readonly shotCodes: readonly string[];
}

const userSummaryColumns = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar
};

const revisionGraceDays = 3;

export class ShotsService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly storage: ObjectStorage,
        private readonly storageConfiguration: StorageConfiguration
    ) {}

    public async list(query: ShotListQuery, viewer: AuthenticatedUser | null): Promise<Page<ShotListItem>> {
        const conditions: SQL[] = [];
        if (query.sceneNumber !== undefined) {
            conditions.push(eq(shots.sceneNumber, query.sceneNumber));
        }
        if (query.difficultyTier !== undefined) {
            conditions.push(eq(shots.difficultyTier, query.difficultyTier));
        }
        if (query.status !== undefined) {
            conditions.push(eq(shots.status, query.status));
        }
        const filter = conditions.length === 0 ? undefined : and(...conditions);

        const [rows, totals] = await Promise.all([
            this.database
                .select({ shot: shots, claimer: userSummaryColumns })
                .from(shots)
                .leftJoin(users, eq(users.id, shots.claimedBy))
                .where(filter)
                .orderBy(asc(shots.sceneNumber), asc(shots.shotCode))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(shots).where(filter)
        ]);

        const shotIds = rows.map((row) => row.shot.id);
        const latest =
            shotIds.length === 0
                ? []
                : await this.database
                      .selectDistinctOn([submissions.shotId], {
                          shotId: submissions.shotId,
                          version: submissions.version,
                          status: submissions.status
                      })
                      .from(submissions)
                      .where(inArray(submissions.shotId, shotIds))
                      .orderBy(submissions.shotId, desc(submissions.version));
        const latestByShot = new Map(latest.map((row) => [row.shotId, { version: row.version, status: row.status }]));
        const now = new Date();

        return createPage(
            rows.map((row) => ({
                shot: row.shot,
                claimer: row.claimer,
                latestSubmission: latestByShot.get(row.shot.id) ?? null,
                isSeniorLocked: this.isSeniorLocked(row.shot, viewer, now)
            })),
            totals[0]?.total ?? 0,
            query
        );
    }

    public async getDetail(shotId: string, viewer: AuthenticatedUser | null): Promise<ShotDetail> {
        const [row] = await this.database
            .select({ shot: shots, claimer: userSummaryColumns })
            .from(shots)
            .leftJoin(users, eq(users.id, shots.claimedBy))
            .where(eq(shots.id, shotId))
            .limit(1);
        if (row === undefined) {
            throw new NotFoundError("Shot");
        }

        const reviewers = alias(users, "reviewers");
        const submissionRows = await this.database
            .select({
                submission: submissions,
                contributor: userSummaryColumns,
                reviewer: {
                    id: reviewers.id,
                    discordId: reviewers.discordId,
                    discordUsername: reviewers.discordUsername,
                    discordAvatar: reviewers.discordAvatar
                }
            })
            .from(submissions)
            .leftJoin(users, eq(users.id, submissions.contributorId))
            .leftJoin(reviewers, eq(reviewers.id, submissions.reviewedBy))
            .where(eq(submissions.shotId, shotId))
            .orderBy(desc(submissions.version));

        const isStaff = viewer !== null && hasAtLeast(viewer.role, Role.Supervisor);
        const views = await Promise.all(
            submissionRows.map(async (item) => {
                const canDownload = isStaff || (viewer !== null && item.submission.contributorId === viewer.id);
                return {
                    submission: canDownload ? item.submission : { ...item.submission, notes: null, supervisorNotes: null },
                    contributor: item.contributor,
                    reviewer: item.reviewer,
                    ...(await this.downloadUrls(item.submission, canDownload))
                };
            })
        );

        return {
            shot: row.shot,
            claimer: row.claimer,
            latestSubmission:
                submissionRows[0] === undefined
                    ? null
                    : { version: submissionRows[0].submission.version, status: submissionRows[0].submission.status },
            isSeniorLocked: this.isSeniorLocked(row.shot, viewer, new Date()),
            submissions: views
        };
    }

    public async create(input: CreateShotInput): Promise<ShotRecord> {
        if (input.roundId !== null) {
            await this.requireRound(input.roundId);
        }
        const seniorPriorityUntil = input.seniorPriorityHours > 0 ? new Date(Date.now() + input.seniorPriorityHours * 3_600_000) : null;
        try {
            const [shot] = await this.database
                .insert(shots)
                .values({
                    roundId: input.roundId,
                    sceneNumber: input.sceneNumber,
                    shotCode: input.shotCode,
                    title: input.title,
                    description: input.description,
                    difficultyTier: input.difficultyTier,
                    seniorPriorityUntil,
                    imageKeys: input.imageKeys === undefined ? [] : [...input.imageKeys]
                })
                .returning();
            if (shot === undefined) {
                throw new Error("Shot insert returned no row.");
            }
            this.notifier.notify({ type: NotificationType.ShotCreated, shot: shotReferenceOf(shot) });
            return shot;
        } catch (error: unknown) {
            throw this.translateShotCodeConflict(error);
        }
    }

    public async update(shotId: string, input: UpdateShotInput): Promise<ShotRecord> {
        if (input.roundId !== undefined && input.roundId !== null) {
            await this.requireRound(input.roundId);
        }
        const values: Partial<typeof shots.$inferInsert> = {
            ...(input.roundId !== undefined ? { roundId: input.roundId } : {}),
            ...(input.sceneNumber !== undefined ? { sceneNumber: input.sceneNumber } : {}),
            ...(input.shotCode !== undefined ? { shotCode: input.shotCode } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.difficultyTier !== undefined ? { difficultyTier: input.difficultyTier } : {}),
            ...(input.imageKeys !== undefined ? { imageKeys: [...input.imageKeys] } : {})
        };
        try {
            const [shot] = await this.database.update(shots).set(values).where(eq(shots.id, shotId)).returning();
            if (shot === undefined) {
                throw new NotFoundError("Shot");
            }
            this.notifier.notify({ type: NotificationType.ShotUpdated, shot: shotReferenceOf(shot) });
            return shot;
        } catch (error: unknown) {
            throw this.translateShotCodeConflict(error);
        }
    }

    public async delete(shotId: string): Promise<void> {
        const [deleted] = await this.database.delete(shots).where(eq(shots.id, shotId)).returning();
        if (deleted === undefined) {
            throw new NotFoundError("Shot");
        }
        if (deleted.imageKeys && deleted.imageKeys.length > 0) {
            // hold orphaned media for 48h recovery buffer before bucket prune
            const scheduledDeleteAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            await this.database.insert(deletedStorageObjects).values(
                deleted.imageKeys.map((key) => ({
                    bucket: StorageBucket.Media,
                    objectKey: key,
                    scheduledDeleteAt
                }))
            );
        }
        this.notifier.notify({ type: NotificationType.ShotDeleted, shot: shotReferenceOf(deleted) });
    }

    public async claim(user: AuthenticatedUser, shotId: string): Promise<ShotRecord> {
        const now = new Date();
        let claimed: ShotRecord;
        try {
            claimed = await this.database.transaction(async (transaction) => {
                const [active] = await transaction
                    .select({ shotCode: shots.shotCode })
                    .from(shots)
                    .where(and(eq(shots.claimedBy, user.id), inArray(shots.status, [ShotStatus.Claimed, ShotStatus.Submitted])))
                    .limit(1);
                if (active !== undefined) {
                    throw new ConflictError(
                        `You already hold ${active.shotCode}. Complete or release it first.`,
                        ErrorCode.ActiveClaimExists
                    );
                }
                const shot = await this.lockShot(transaction, shotId);
                if (shot.status !== ShotStatus.Available) {
                    throw new ConflictError(`Shot ${shot.shotCode} is ${shot.status} and cannot be claimed.`, ErrorCode.ShotUnavailable);
                }
                if (this.isSeniorLocked(shot, user, now) && shot.seniorPriorityUntil !== null) {
                    const hours = Math.ceil((shot.seniorPriorityUntil.getTime() - now.getTime()) / 3_600_000);
                    throw new ForbiddenError(
                        `This shot is reserved for senior contributors for another ${hours} hour(s).`,
                        ErrorCode.SeniorPriorityLock
                    );
                }
                const [updated] = await transaction
                    .update(shots)
                    .set({
                        status: ShotStatus.Claimed,
                        claimedBy: user.id,
                        claimedAt: now,
                        deadlineAt: new Date(now.getTime() + tierDaysOf(shot.difficultyTier) * 86_400_000)
                    })
                    .where(eq(shots.id, shotId))
                    .returning();
                return this.required(updated);
            });
        } catch (error: unknown) {
            if (isUniqueViolation(error, "shots_one_active_claim_per_user")) {
                throw new ConflictError("You already hold an active claim. Complete or release it first.", ErrorCode.ActiveClaimExists);
            }
            throw error;
        }

        this.notifier.notify({
            type: NotificationType.ShotClaimed,
            shot: shotReferenceOf(claimed),
            claimant: personOfUser(user),
            deadlineAt: (claimed.deadlineAt ?? now).toISOString()
        });
        return claimed;
    }

    public async release(user: AuthenticatedUser, shotId: string, reason: string | null): Promise<ShotRecord> {
        const released = await this.database.transaction(async (transaction) => {
            const shot = await this.lockShot(transaction, shotId);
            const isStaff = hasAtLeast(user.role, Role.Supervisor);
            if (shot.claimedBy !== user.id && !isStaff) {
                throw new ForbiddenError("You do not hold the claim on this shot.");
            }
            if (shot.status !== ShotStatus.Claimed) {
                throw new ConflictError(`Only claimed shots can be released; this shot is ${shot.status}.`, ErrorCode.ShotUnavailable);
            }
            const [updated] = await transaction
                .update(shots)
                .set({ status: ShotStatus.Available, claimedBy: null, claimedAt: null, deadlineAt: null })
                .where(eq(shots.id, shotId))
                .returning();
            return this.required(updated);
        });
        this.notifier.notify({ type: NotificationType.ShotReleased, shot: shotReferenceOf(released), actor: personOfUser(user), reason });
        return released;
    }

    public async createDeliverableUpload(user: AuthenticatedUser, shotId: string, input: DeliverableUploadInput): Promise<PresignedUpload> {
        if (!this.storage.isEnabled(StorageBucket.Deliverables)) {
            throw new ServiceUnavailableError("Deliverable uploads are not configured on this server.");
        }
        if (!deliverableContentTypes[input.kind].includes(input.contentType)) {
            throw new UnprocessableError(
                `contentType must be one of ${deliverableContentTypes[input.kind].join(", ")}.`,
                ErrorCode.UnsupportedMediaType,
                [{ path: "body.contentType", message: "unsupported for this deliverable kind" }]
            );
        }
        const fileName = sanitizeFileName(input.fileName, input.kind);
        const [shot] = await this.database.select().from(shots).where(eq(shots.id, shotId)).limit(1);
        if (shot === undefined) {
            throw new NotFoundError("Shot");
        }
        this.assertActiveClaim(shot, user);
        return this.storage.createUpload(
            StorageBucket.Deliverables,
            createDeliverableKey(shotId, user.id, fileName),
            input.contentType,
            input.sizeBytes
        );
    }

    public async submit(user: AuthenticatedUser, shotId: string, input: SubmitWorkInput): Promise<SubmissionRecord> {
        const maxBytes = this.storageConfiguration.deliverableMaxBytes;
        await assertDeliverable(this.storage, input.videoKey, DeliverableKind.Video, shotId, user.id, maxBytes, "videoKey");
        if (input.blendKey !== null) {
            await assertDeliverable(this.storage, input.blendKey, DeliverableKind.Blend, shotId, user.id, maxBytes, "blendKey");
        }

        const buffer = await this.storage.getObject(StorageBucket.Deliverables, input.videoKey, 524288);
        const detection = inspectMediaAiSignatures(buffer);
        const aiFlags = detection.flagged ? [...detection.flags] : [];

        const { submission, shot } = await this.database.transaction(async (transaction) => {
            const locked = await this.lockShot(transaction, shotId);
            this.assertActiveClaim(locked, user);
            const [latest] = await transaction
                .select({ version: submissions.version })
                .from(submissions)
                .where(eq(submissions.shotId, shotId))
                .orderBy(desc(submissions.version))
                .limit(1);
            const [created] = await transaction
                .insert(submissions)
                .values({
                    shotId,
                    contributorId: user.id,
                    version: (latest?.version ?? 0) + 1,
                    videoKey: input.videoKey,
                    blendKey: input.blendKey,
                    notes: input.notes,
                    aiFlags
                })
                .returning();
            await transaction.update(shots).set({ status: ShotStatus.Submitted }).where(eq(shots.id, shotId));
            if (rankOf(user.role) < rankOf(Role.Contributor)) {
                // submitting work earns contributor standing
                await transaction.update(users).set({ role: Role.Contributor }).where(eq(users.id, user.id));
            }
            if (created === undefined) {
                throw new Error("Submission insert returned no row.");
            }
            return { submission: created, shot: locked };
        });

        this.notifier.notify({
            type: NotificationType.SubmissionCreated,
            shot: shotReferenceOf(shot),
            submissionId: submission.id,
            version: submission.version,
            contributor: personOfUser(user),
            notes: submission.notes
        });

        if (aiFlags.length > 0) {
            this.notifier.notify({
                type: NotificationType.MediaFlaggedAi,
                mediaKind: "task_submission",
                targetId: submission.id,
                title: `${shot.shotCode} (v${submission.version})`,
                author: personOfUser(user),
                flags: aiFlags,
                snippet: detection.snippet
            });
        }
        return submission;
    }

    public async reclaimExpired(): Promise<ReclaimResult> {
        const reclaimed = await this.database.transaction(async (transaction) => {
            const expired = await transaction
                .select({
                    id: shots.id,
                    shotCode: shots.shotCode,
                    title: shots.title,
                    sceneNumber: shots.sceneNumber,
                    difficultyTier: shots.difficultyTier,
                    claimantName: users.discordUsername,
                    claimantDiscordId: users.discordId
                })
                .from(shots)
                .leftJoin(users, eq(users.id, shots.claimedBy))
                .where(and(eq(shots.status, ShotStatus.Claimed), lt(shots.deadlineAt, new Date())))
                .orderBy(asc(shots.deadlineAt))
                .limit(500)
                .for("update", { of: shots, skipLocked: true });
            if (expired.length > 0) {
                await transaction
                    .update(shots)
                    .set({ status: ShotStatus.Available, claimedBy: null, claimedAt: null, deadlineAt: null })
                    .where(
                        inArray(
                            shots.id,
                            expired.map((shot) => shot.id)
                        )
                    );
            }
            return expired;
        });

        for (const shot of reclaimed) {
            this.notifier.notify({
                type: NotificationType.ShotExpired,
                shot: shotReferenceOf(shot),
                claimant:
                    shot.claimantDiscordId === null || shot.claimantName === null
                        ? null
                        : { discordId: shot.claimantDiscordId, username: shot.claimantName }
            });
        }
        return { reclaimedCount: reclaimed.length, shotCodes: reclaimed.map((shot) => shot.shotCode) };
    }

    public static revisionDeadline(current: Date | null, now: Date = new Date()): Date {
        const grace = new Date(now.getTime() + revisionGraceDays * 86_400_000);
        return current !== null && current.getTime() > grace.getTime() ? current : grace;
    }

    private async downloadUrls(
        submission: SubmissionRecord,
        allowed: boolean
    ): Promise<{ videoUrl: string | null; blendUrl: string | null }> {
        if (!allowed || !this.storage.isEnabled(StorageBucket.Deliverables)) {
            return { videoUrl: null, blendUrl: null };
        }
        return {
            videoUrl: await this.storage.createDownloadUrl(StorageBucket.Deliverables, submission.videoKey),
            blendUrl:
                submission.blendKey === null ? null : await this.storage.createDownloadUrl(StorageBucket.Deliverables, submission.blendKey)
        };
    }

    private isSeniorLocked(shot: ShotRecord, viewer: AuthenticatedUser | null, now: Date): boolean {
        return (
            shot.status === ShotStatus.Available &&
            shot.seniorPriorityUntil !== null &&
            shot.seniorPriorityUntil.getTime() > now.getTime() &&
            seniorPriorityTiers.has(shot.difficultyTier) &&
            (viewer === null || !hasAtLeast(viewer.role, Role.SeniorContributor))
        );
    }

    private assertActiveClaim(shot: ShotRecord, user: AuthenticatedUser): void {
        if (shot.claimedBy !== user.id) {
            throw new ForbiddenError("You do not hold the claim on this shot.");
        }
        if (shot.status !== ShotStatus.Claimed) {
            throw new ConflictError(
                `The shot is ${shot.status}; deliverables can only be submitted while it is claimed.`,
                ErrorCode.ShotUnavailable
            );
        }
    }

    private async lockShot(transaction: Transaction, shotId: string): Promise<ShotRecord> {
        const [shot] = await transaction.select().from(shots).where(eq(shots.id, shotId)).limit(1).for("update");
        if (shot === undefined) {
            throw new NotFoundError("Shot");
        }
        return shot;
    }

    private async requireRound(roundId: string): Promise<void> {
        const [round] = await this.database.select({ id: votingRounds.id }).from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1);
        if (round === undefined) {
            throw new NotFoundError("Round");
        }
    }

    private translateShotCodeConflict(error: unknown): unknown {
        return isUniqueViolation(error) ? new ConflictError("A shot with this shot code already exists.") : error;
    }

    private required(shot: ShotRecord | undefined): ShotRecord {
        if (shot === undefined) {
            throw new NotFoundError("Shot");
        }
        return shot;
    }
}
