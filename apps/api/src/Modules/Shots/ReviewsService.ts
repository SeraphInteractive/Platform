import { asc, count, eq } from "drizzle-orm";
import { ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { UserActor } from "../../Common/Security/Principal.js";
import { ReviewDecision, ShotStatus, SubmissionStatus } from "../../Domain/Enums.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import {
    shots,
    submissions,
    users,
    type ShotRecord,
    type SubmissionRecord,
    type UserRecord
} from "../../Infrastructure/Database/Schema.js";
import {
    NotificationType,
    personOfActor,
    personOfUser,
    shotReferenceOf,
    type Notifier
} from "../../Infrastructure/Notifications/Notification.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import { ShotsService } from "./ShotsService.js";

export interface ReviewQueueItem {
    readonly submission: SubmissionRecord;
    readonly shot: ShotRecord;
    readonly contributor: Pick<UserRecord, "id" | "discordId" | "discordUsername" | "discordAvatar"> | null;
    readonly videoUrl: string | null;
    readonly blendUrl: string | null;
}

export class ReviewsService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly storage: ObjectStorage
    ) {}

    public async queue(query: PaginationQuery): Promise<Page<ReviewQueueItem>> {
        const pending = eq(submissions.status, SubmissionStatus.PendingReview);
        const [rows, totals] = await Promise.all([
            this.database
                .select({
                    submission: submissions,
                    shot: shots,
                    contributor: {
                        id: users.id,
                        discordId: users.discordId,
                        discordUsername: users.discordUsername,
                        discordAvatar: users.discordAvatar
                    }
                })
                .from(submissions)
                .innerJoin(shots, eq(shots.id, submissions.shotId))
                .leftJoin(users, eq(users.id, submissions.contributorId))
                .where(pending)
                .orderBy(asc(submissions.createdAt), asc(submissions.id))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(submissions).where(pending)
        ]);

        const enabled = this.storage.isEnabled(StorageBucket.Deliverables);
        const items = await Promise.all(
            rows.map(async (row) => ({
                ...row,
                videoUrl: enabled ? await this.storage.createDownloadUrl(StorageBucket.Deliverables, row.submission.videoKey) : null,
                blendUrl:
                    enabled && row.submission.blendKey !== null
                        ? await this.storage.createDownloadUrl(StorageBucket.Deliverables, row.submission.blendKey)
                        : null
            }))
        );
        return createPage(items, totals[0]?.total ?? 0, query);
    }

    public async review(
        reviewer: UserActor,
        submissionId: string,
        decision: ReviewDecision,
        notes: string | null
    ): Promise<SubmissionRecord> {
        const { submission, shot } = await this.database.transaction(async (transaction) => {
            const [current] = await transaction.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1).for("update");
            if (current === undefined) {
                throw new NotFoundError("Submission");
            }
            if (current.contributorId === reviewer.userId) {
                throw new ForbiddenError("You cannot review your own submission.");
            }
            if (current.status !== SubmissionStatus.PendingReview) {
                throw new ConflictError("This submission has already been reviewed.", ErrorCode.SubmissionNotPending);
            }
            const [lockedShot] = await transaction.select().from(shots).where(eq(shots.id, current.shotId)).limit(1).for("update");
            if (lockedShot === undefined) {
                throw new NotFoundError("Shot");
            }

            const approved = decision === ReviewDecision.Approved;
            const [updated] = await transaction
                .update(submissions)
                .set({
                    status: approved ? SubmissionStatus.Approved : SubmissionStatus.RevisionRequested,
                    supervisorNotes: notes,
                    reviewedBy: reviewer.userId,
                    reviewedAt: new Date()
                })
                .where(eq(submissions.id, submissionId))
                .returning();
            await transaction
                .update(shots)
                .set(
                    approved
                        ? { status: ShotStatus.Approved, deadlineAt: null }
                        : { status: ShotStatus.Claimed, deadlineAt: ShotsService.revisionDeadline(lockedShot.deadlineAt) }
                )
                .where(eq(shots.id, lockedShot.id));
            if (updated === undefined) {
                throw new NotFoundError("Submission");
            }
            return { submission: updated, shot: lockedShot };
        });

        const [contributor] = await this.database
            .select({ discordId: users.discordId, discordUsername: users.discordUsername })
            .from(users)
            .where(eq(users.id, submission.contributorId))
            .limit(1);
        const videoUrl = this.storage.getPublicUrl(StorageBucket.Deliverables, submission.videoKey);
        this.notifier.notify({
            type: NotificationType.SubmissionReviewed,
            shot: shotReferenceOf(shot),
            submissionId: submission.id,
            version: submission.version,
            videoUrl,
            decision,
            contributor: contributor === undefined ? { discordId: null, username: "Unknown" } : personOfUser(contributor),
            reviewer: personOfActor(reviewer),
            notes
        });
        return submission;
    }
}
