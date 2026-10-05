import { z } from "zod";
import {
    DifficultyTier,
    DocumentSlug,
    EntryStatus,
    PollType,
    RaidFlag,
    RaidSeverity,
    ReviewDecision,
    Role,
    RoundStatus,
    Specialty
} from "./Enums.js";
import { snowflakeSchema, timestampSchema, uuidSchema } from "./Http.js";

export enum NotificationType {
    BallotSubmitted = "ballot.submitted",
    BallotBlocked = "ballot.blocked",
    UserBlacklisted = "user.blacklisted",
    UserReinstated = "user.reinstated",
    UserRoleChanged = "user.role_changed",
    ContributorPromoted = "contributor.promoted",
    RaidAlert = "raid.alert",
    RoundCreated = "round.created",
    RoundUpdated = "round.updated",
    RoundDeleted = "round.deleted",
    RoundStatusChanged = "round.status_changed",
    RoundFinalized = "round.finalized",
    EntrySubmitted = "entry.submitted",
    EntryUpdated = "entry.updated",
    EntryDeleted = "entry.deleted",
    EntryStatusChanged = "entry.status_changed",
    EntryReinstated = "entry.reinstated",
    ShotCreated = "shot.created",
    ShotUpdated = "shot.updated",
    ShotDeleted = "shot.deleted",
    ShotClaimed = "shot.claimed",
    ShotReleased = "shot.released",
    ShotExpired = "shot.expired",
    SubmissionCreated = "submission.created",
    SubmissionReviewed = "submission.reviewed",
    PipelineUpdated = "pipeline.updated",
    MediaFlaggedAi = "media.flagged_ai",
    DocumentUpdated = "document.updated"
}

export const notificationPersonSchema = z.object({
    discordId: snowflakeSchema.nullable(),
    username: z.string()
});

const roundReference = z.object({ id: uuidSchema, title: z.string(), pollType: z.enum(PollType) });
const entryReference = z.object({ id: uuidSchema, title: z.string(), mediaUrl: z.string().nullable().optional() });
const shotReference = z.object({
    id: uuidSchema,
    code: z.string(),
    title: z.string(),
    sceneNumber: z.number().int(),
    difficulty: z.enum(DifficultyTier)
});

function notification<T extends NotificationType, S extends z.ZodRawShape>(
    type: T,
    shape: S
): z.ZodObject<{ type: z.ZodLiteral<T>; occurredAt: typeof timestampSchema } & S> {
    return z.object({ type: z.literal(type), occurredAt: timestampSchema, ...shape });
}

export const platformNotificationSchema = z.discriminatedUnion("type", [
    notification(NotificationType.BallotSubmitted, {
        round: roundReference,
        voter: notificationPersonSchema,
        isChange: z.boolean()
    }),
    notification(NotificationType.BallotBlocked, {
        round: roundReference,
        voter: notificationPersonSchema,
        reason: z.string().nullable()
    }),
    notification(NotificationType.UserBlacklisted, {
        user: notificationPersonSchema,
        actor: notificationPersonSchema,
        reason: z.string().nullable()
    }),
    notification(NotificationType.UserReinstated, { user: notificationPersonSchema, actor: notificationPersonSchema }),
    notification(NotificationType.UserRoleChanged, {
        user: notificationPersonSchema,
        role: z.enum(Role),
        specialties: z.array(z.enum(Specialty)),
        actor: notificationPersonSchema
    }),
    notification(NotificationType.ContributorPromoted, { user: notificationPersonSchema, actor: notificationPersonSchema }),
    notification(NotificationType.RaidAlert, {
        round: roundReference,
        entry: entryReference,
        severity: z.enum(RaidSeverity),
        flags: z.array(z.enum(RaidFlag)),
        velocityZScore: z.number(),
        quarantined: z.boolean()
    }),
    notification(NotificationType.RoundCreated, {
        round: roundReference,
        actor: notificationPersonSchema,
        opensAt: timestampSchema.nullable(),
        closesAt: timestampSchema.nullable()
    }),
    notification(NotificationType.RoundUpdated, {
        round: roundReference,
        actor: notificationPersonSchema,
        opensAt: timestampSchema.nullable(),
        closesAt: timestampSchema.nullable()
    }),
    notification(NotificationType.RoundDeleted, {
        round: roundReference,
        actor: notificationPersonSchema
    }),
    notification(NotificationType.RoundStatusChanged, {
        round: roundReference,
        from: z.enum(RoundStatus),
        to: z.enum(RoundStatus),
        actor: notificationPersonSchema
    }),
    notification(NotificationType.RoundFinalized, {
        round: roundReference,
        totalBallots: z.number().int(),
        winner: z
            .object({
                entryId: uuidSchema,
                title: z.string(),
                mediaUrl: z.string().nullable().optional(),
                rawScore: z.number(),
                voteSharePercentage: z.number(),
                regularizedTotalScore: z.number().nullable()
            })
            .nullable(),
        actor: notificationPersonSchema
    }),
    notification(NotificationType.EntrySubmitted, {
        round: roundReference,
        entry: entryReference,
        status: z.enum(EntryStatus),
        author: notificationPersonSchema
    }),
    notification(NotificationType.EntryUpdated, {
        round: roundReference,
        entry: entryReference,
        actor: notificationPersonSchema
    }),
    notification(NotificationType.EntryDeleted, {
        round: roundReference,
        entry: entryReference,
        actor: notificationPersonSchema
    }),
    notification(NotificationType.EntryStatusChanged, {
        round: roundReference,
        entry: entryReference,
        status: z.enum(EntryStatus),
        author: notificationPersonSchema.nullable(),
        actor: notificationPersonSchema
    }),
    notification(NotificationType.EntryReinstated, {
        round: roundReference,
        entry: entryReference,
        actor: notificationPersonSchema
    }),
    notification(NotificationType.ShotCreated, { shot: shotReference }),
    notification(NotificationType.ShotUpdated, { shot: shotReference }),
    notification(NotificationType.ShotDeleted, { shot: shotReference }),
    notification(NotificationType.ShotClaimed, { shot: shotReference, claimant: notificationPersonSchema, deadlineAt: timestampSchema }),
    notification(NotificationType.ShotReleased, {
        shot: shotReference,
        actor: notificationPersonSchema,
        reason: z.string().nullable()
    }),
    notification(NotificationType.ShotExpired, { shot: shotReference, claimant: notificationPersonSchema.nullable() }),
    notification(NotificationType.SubmissionCreated, {
        shot: shotReference,
        submissionId: uuidSchema,
        version: z.number().int(),
        contributor: notificationPersonSchema,
        notes: z.string().nullable()
    }),
    notification(NotificationType.SubmissionReviewed, {
        shot: shotReference,
        submissionId: uuidSchema,
        version: z.number().int(),
        decision: z.enum(ReviewDecision),
        contributor: notificationPersonSchema,
        reviewer: notificationPersonSchema,
        notes: z.string().nullable()
    }),
    notification(NotificationType.PipelineUpdated, {
        stepId: z.string(),
        stepTitle: z.string(),
        phaseNumber: z.number().int(),
        phaseTitle: z.string(),
        progressPercent: z.number(),
        isPhaseTransition: z.boolean(),
        actor: notificationPersonSchema
    }),
    notification(NotificationType.MediaFlaggedAi, {
        mediaKind: z.enum(["entry", "task_submission"]),
        targetId: uuidSchema,
        title: z.string(),
        author: notificationPersonSchema,
        flags: z.array(z.string()),
        snippet: z.string().nullable()
    }),
    notification(NotificationType.DocumentUpdated, {
        slug: z.enum(DocumentSlug),
        revision: z.number().int(),
        title: z.string(),
        sections: z.array(z.object({ id: z.string(), title: z.string(), html: z.string() })),
        actor: notificationPersonSchema,
        note: z.string().nullable()
    })
]);

export type PlatformNotification = z.infer<typeof platformNotificationSchema>;

export type NotificationOf<T extends NotificationType> = Extract<PlatformNotification, { type: T }>;

export type NotificationPerson = z.infer<typeof notificationPersonSchema>;

export type ShotReference = z.infer<typeof shotReference>;

export type RoundReference = z.infer<typeof roundReference>;

export const notificationStreamIdPattern = /^\d{1,20}-\d{1,20}$/u;
