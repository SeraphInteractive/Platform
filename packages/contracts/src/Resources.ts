import { z } from "zod";
import {
    DifficultyTier,
    DepartmentSlug,
    DocumentSlug,
    documentLimits,
    EntryStatus,
    PollType,
    RaidFlag,
    RaidSeverity,
    Role,
    RoundStatus,
    ScreenplayRole,
    SeparationAction,
    SeparationStatus,
    ShotStatus,
    ShotType,
    Specialty,
    SubmissionStatus
} from "./Enums.js";
import { snowflakeSchema, timestampSchema, uuidSchema } from "./Http.js";
import { fieldRules } from "./Validation.js";

export const userSummarySchema = z
    .object({
        id: uuidSchema,
        username: z.string(),
        avatarUrl: z.url().nullable()
    })
    .meta({ id: "UserSummary" });

export const userSchema = z
    .object({
        id: uuidSchema,
        discordId: snowflakeSchema,
        username: z.string(),
        avatarUrl: z.url().nullable(),
        role: z.enum(Role),
        specialties: z.array(z.enum(Specialty)),
        isBlacklisted: z.boolean(),
        isOnboarded: z.boolean(),
        termsVersion: z.string().nullable(),
        isVerified: z.boolean(),
        createdAt: timestampSchema
    })
    .meta({ id: "User" });

export const moderatedUserSchema = userSchema
    .extend({
        blacklistReason: z.string().nullable(),
        blacklistedAt: timestampSchema.nullable()
    })
    .meta({ id: "ModeratedUser" });

export const specialtyHolderSchema = z
    .object({
        id: uuidSchema,
        username: z.string(),
        discordId: snowflakeSchema
    })
    .meta({ id: "SpecialtyHolder" });

export const specialtyHoldersSchema = z.record(z.string(), specialtyHolderSchema.nullable()).meta({ id: "SpecialtyHolders" });

export const sessionSchema = z
    .object({
        token: z.string(),
        tokenType: z.literal("Bearer"),
        expiresAt: timestampSchema,
        user: userSchema
    })
    .meta({ id: "Session" });

export const roundSchema = z
    .object({
        id: uuidSchema,
        title: z.string(),
        status: z.enum(RoundStatus),
        pollType: z.enum(PollType),
        opensAt: timestampSchema.nullable(),
        closesAt: timestampSchema.nullable(),
        isAcceptingVotes: z.boolean(),
        createdBy: uuidSchema,
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Round" });

export const roundDetailSchema = roundSchema
    .extend({
        eligibleEntryCount: z.number().int(),
        ballotCount: z.number().int(),
        warnings: z.array(z.string())
    })
    .meta({ id: "RoundDetail" });

export const binaryChoiceInputSchema = z
    .object({
        title: fieldRules.entryTitle,
        description: fieldRules.entryDescription.default(null),
        mediaKey: z.string().max(255).nullable().default(null)
    })
    .meta({ id: "BinaryChoiceInput" });

export const binaryChoiceUpdateInputSchema = z
    .object({
        id: uuidSchema.optional(),
        title: fieldRules.entryTitle,
        description: fieldRules.entryDescription.default(null),
        mediaKey: z.string().max(255).nullable().optional()
    })
    .meta({ id: "BinaryChoiceUpdateInput" });

export const entrySchema = z
    .object({
        id: uuidSchema,
        roundId: uuidSchema,
        title: z.string(),
        description: z.string().nullable(),
        status: z.enum(EntryStatus),
        isQuarantined: z.boolean(),
        mediaUrl: z.url().nullable(),
        aiFlags: z.array(z.string()).default([]),
        submittedBy: uuidSchema.nullable(),
        author: userSummarySchema.nullable().default(null),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Entry" });

export const ballotSchema = z
    .object({
        roundId: uuidSchema,
        picks: z.array(uuidSchema),
        castAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Ballot" });

export const ledgerBallotSchema = z
    .object({
        discordId: z.string().describe("Voter Discord Snowflake ID."),
        discordUsername: z.string().describe("Voter current Discord username."),
        picks: z.array(uuidSchema),
        castAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "LedgerBallot" });

export const leaderboardItemSchema = z
    .object({
        position: z.number().int(),
        entryId: uuidSchema,
        title: z.string(),
        rankCounts: z.array(z.number().int()),
        appearanceCount: z.number().int(),
        rawScore: z.number(),
        voteSharePercentage: z.number(),
        regularizedMeanScore: z.number().nullable(),
        regularizedTotalScore: z.number().nullable()
    })
    .meta({ id: "LeaderboardItem" });

export const leaderboardSchema = z
    .object({
        roundId: uuidSchema,
        pollType: z.enum(PollType),
        totalBallots: z.number().int(),
        totalPoints: z.number(),
        isConserved: z.boolean(),
        items: z.array(leaderboardItemSchema),
        computedAt: timestampSchema
    })
    .meta({ id: "Leaderboard" });

export const separationSchema = z
    .object({
        entryA: uuidSchema,
        entryB: uuidSchema,
        deltaScore: z.number(),
        varianceA: z.number(),
        varianceB: z.number(),
        covarianceAB: z.number(),
        deltaVariance: z.number(),
        standardError: z.number(),
        zScore: z.number(),
        pValue: z.number(),
        status: z.enum(SeparationStatus),
        recommendedAction: z.enum(SeparationAction)
    })
    .meta({ id: "RankSeparation" });

export const roundResultSchema = z
    .object({
        id: uuidSchema,
        roundId: uuidSchema,
        totalBallots: z.number().int(),
        totalPoints: z.number(),
        isConserved: z.boolean(),
        leaderboard: z.array(leaderboardItemSchema),
        separations: z.array(separationSchema),
        finalizedAt: timestampSchema,
        finalizedBy: uuidSchema
    })
    .meta({ id: "RoundResult" });

export const raidTelemetrySchema = z
    .object({
        id: uuidSchema,
        entryId: uuidSchema,
        roundId: uuidSchema,
        compositeScore: z.number(),
        severity: z.enum(RaidSeverity),
        skewRatio: z.number(),
        rankEntropy: z.number(),
        velocityZScore: z.number(),
        flags: z.array(z.enum(RaidFlag)),
        breakdown: z.object({ topRankPoints: z.number(), lowerRankPoints: z.number(), topRankShare: z.number() }),
        createdAt: timestampSchema
    })
    .meta({ id: "RaidTelemetry" });

export const departmentSchema = z
    .object({
        id: uuidSchema,
        name: z.string(),
        slug: z.enum(DepartmentSlug),
        supervisorSpecialties: z.array(z.enum(Specialty)),
        contributorSpecialties: z.array(z.enum(Specialty)),
        shotTypes: z.array(z.enum(ShotType)),
        discordCategoryId: snowflakeSchema.nullable().optional(),
        discordForumId: snowflakeSchema.nullable().optional(),
        discordChatChannelId: snowflakeSchema.nullable().optional(),
        discordInfoChannelId: snowflakeSchema.nullable().optional(),
        discordInfoWebhookUrl: z.string().nullable().optional(),
        discordLogsChannelId: snowflakeSchema.nullable().optional(),
        discordLogsWebhookUrl: z.string().nullable().optional(),
        discordApplyChannelId: snowflakeSchema.nullable().optional(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Department" });

export const shotSchema = z
    .object({
        id: uuidSchema,
        roundId: uuidSchema.nullable(),
        sceneNumber: z.number().int(),
        shotCode: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        difficultyTier: z.enum(DifficultyTier),
        tierDays: z.number().int(),
        shotType: z.enum(ShotType),
        departmentId: uuidSchema.nullable().optional(),
        status: z.enum(ShotStatus),
        claimer: userSummarySchema.nullable(),
        creator: userSummarySchema.nullable().default(null),
        claimedAt: timestampSchema.nullable(),
        deadlineAt: timestampSchema.nullable(),
        seniorPriorityUntil: timestampSchema.nullable(),
        isSeniorLocked: z.boolean(),
        latestSubmission: z.object({ version: z.number().int(), status: z.enum(SubmissionStatus) }).nullable(),
        imageUrls: z.array(z.url()).default([]),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Shot" });

export const submissionSchema = z
    .object({
        id: uuidSchema,
        shotId: uuidSchema,
        version: z.number().int(),
        status: z.enum(SubmissionStatus),
        notes: z.string().nullable(),
        supervisorNotes: z.string().nullable(),
        contributor: userSummarySchema.nullable(),
        reviewer: userSummarySchema.nullable(),
        reviewedAt: timestampSchema.nullable(),
        videoUrl: z.url().nullable().describe("Short-lived download link, only for staff and the contributor."),
        blendUrl: z.url().nullable(),
        vaultUrl: z.url().nullable().optional(),
        aiFlags: z.array(z.string()).default([]),
        createdAt: timestampSchema
    })
    .meta({ id: "Submission" });

export const shotDetailSchema = shotSchema.extend({ submissions: z.array(submissionSchema) }).meta({ id: "ShotDetail" });

export const reviewQueueItemSchema = submissionSchema
    .extend({ shot: shotSchema.omit({ claimer: true, latestSubmission: true, isSeniorLocked: true }) })
    .meta({ id: "ReviewQueueItem" });

export const presignedUploadSchema = z
    .object({
        key: z.string(),
        method: z.literal("PUT"),
        url: z.url(),
        headers: z.record(z.string(), z.string()),
        expiresAt: timestampSchema
    })
    .meta({ id: "PresignedUpload" });

export const shotThreadMapSchema = z
    .object({
        shotId: uuidSchema,
        discordThreadId: snowflakeSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "ShotThreadMap" });

export const reclaimResultSchema = z.object({ reclaimedCount: z.number().int(), shotCodes: z.array(z.string()) });

export const pipelineProgressSchema = z
    .object({
        stepIndex: z.number().int().min(0),
        stepId: z.string().max(32),
        stepTitle: z.string().max(128),
        phaseNumber: z.number().int().min(0),
        phaseTitle: z.string().max(128),
        progressPercent: z.number().min(0).max(100),
        isPhaseTransition: z.boolean(),
        updatedAt: timestampSchema.nullable()
    })
    .meta({ id: "PipelineProgress" });

export type UserSummaryDto = z.infer<typeof userSummarySchema>;
export type UserDto = z.infer<typeof userSchema>;
export type ModeratedUserDto = z.infer<typeof moderatedUserSchema>;
export type SpecialtyHolderDto = z.infer<typeof specialtyHolderSchema>;
export type SpecialtyHoldersDto = z.infer<typeof specialtyHoldersSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;
export type RoundDto = z.infer<typeof roundSchema>;
export type RoundDetailDto = z.infer<typeof roundDetailSchema>;
export type EntryDto = z.infer<typeof entrySchema>;
export type BallotDto = z.infer<typeof ballotSchema>;
export type LedgerBallotDto = z.infer<typeof ledgerBallotSchema>;
export type LeaderboardItemDto = z.infer<typeof leaderboardItemSchema>;
export type LeaderboardDto = z.infer<typeof leaderboardSchema>;
export type SeparationDto = z.infer<typeof separationSchema>;
export type RoundResultDto = z.infer<typeof roundResultSchema>;
export type RaidTelemetryDto = z.infer<typeof raidTelemetrySchema>;
export type DepartmentDto = z.infer<typeof departmentSchema>;
export type ShotDto = z.infer<typeof shotSchema>;
export type SubmissionDto = z.infer<typeof submissionSchema>;
export type ShotDetailDto = z.infer<typeof shotDetailSchema>;
export type ReviewQueueItemDto = z.infer<typeof reviewQueueItemSchema>;
export type PresignedUploadDto = z.infer<typeof presignedUploadSchema>;
export type ShotThreadMapDto = z.infer<typeof shotThreadMapSchema>;
export type ReclaimResultDto = z.infer<typeof reclaimResultSchema>;
export type PipelineProgressDto = z.infer<typeof pipelineProgressSchema>;
export type BinaryChoiceInputDto = z.infer<typeof binaryChoiceInputSchema>;
export type BinaryChoiceUpdateInputDto = z.infer<typeof binaryChoiceUpdateInputSchema>;

export const emailVerificationSchema = z
    .object({
        expiresAt: timestampSchema,
        resendAvailableAt: timestampSchema
    })
    .meta({ id: "EmailVerification" });

export type EmailVerificationDto = z.infer<typeof emailVerificationSchema>;

export const documentSectionSchema = z
    .object({
        id: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
            .max(documentLimits.sectionIdLength),
        title: z.string(),
        html: z.string().max(documentLimits.sectionHtmlLength)
    })
    .meta({ id: "DocumentSection" });

export const documentSectionInputSchema = z
    .object({
        id: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
            .max(documentLimits.sectionIdLength),
        title: fieldRules.sectionTitle,
        html: z.string().max(documentLimits.sectionHtmlLength)
    })
    .meta({ id: "DocumentSectionEdit" });

export const documentSchema = z
    .object({
        slug: z.enum(DocumentSlug),
        title: z.string(),
        sections: z.array(documentSectionSchema),
        revision: z.number().int().nonnegative(),
        updatedAt: timestampSchema.nullable(),
        updatedBy: userSummarySchema.nullable()
    })
    .meta({ id: "Document" });

export const documentUpdateSchema = z
    .object({
        title: fieldRules.documentTitle,
        sections: z.array(documentSectionInputSchema).min(1).max(documentLimits.sections),
        expectedRevision: z.number().int().nonnegative(),
        requireReacceptance: z.boolean().default(false),
        note: fieldRules.documentNote.default(null)
    })
    .meta({ id: "DocumentUpdate" });

export const documentRevisionSummarySchema = z
    .object({
        revision: z.number().int().positive(),
        title: z.string(),
        note: z.string().nullable(),
        requiresReacceptance: z.boolean(),
        author: userSummarySchema.nullable(),
        createdAt: timestampSchema
    })
    .meta({ id: "DocumentRevisionSummary" });

export const documentRevisionSchema = documentRevisionSummarySchema
    .extend({ sections: z.array(documentSectionSchema) })
    .meta({ id: "DocumentRevision" });

export const legalAcceptanceSchema = z.object({ version: z.string() }).meta({ id: "LegalAcceptance" });

export type DocumentSectionDto = z.infer<typeof documentSectionSchema>;
export type DocumentDto = z.infer<typeof documentSchema>;
export type DocumentUpdateDto = z.input<typeof documentUpdateSchema>;
export type DocumentRevisionSummaryDto = z.infer<typeof documentRevisionSummarySchema>;
export type DocumentRevisionDto = z.infer<typeof documentRevisionSchema>;

export const screenplayShelfSchema = z
    .object({
        id: uuidSchema,
        userId: uuidSchema,
        name: z.string().min(1).max(100),
        createdAt: timestampSchema
    })
    .meta({ id: "ScreenplayShelf" });

export const createScreenplayShelfSchema = z
    .object({
        name: z.string().trim().min(1).max(100)
    })
    .meta({ id: "CreateScreenplayShelf" });

export const screenplayCollaboratorSchema = z
    .object({
        id: uuidSchema,
        screenplayId: uuidSchema,
        userId: uuidSchema,
        user: userSummarySchema.optional(),
        role: z.enum(ScreenplayRole),
        invitedBy: uuidSchema,
        createdAt: timestampSchema
    })
    .meta({ id: "ScreenplayCollaborator" });

export const addScreenplayCollaboratorSchema = z
    .object({
        userId: uuidSchema,
        role: z.enum(ScreenplayRole).default(ScreenplayRole.Editor)
    })
    .meta({ id: "AddScreenplayCollaborator" });

export const screenplayVersionSchema = z
    .object({
        id: uuidSchema,
        screenplayId: uuidSchema,
        userId: uuidSchema,
        user: userSummarySchema.nullable().optional(),
        name: z.string().min(1).max(150),
        content: z.record(z.string(), z.any()).or(z.array(z.any())),
        wordCount: z.number().int().nonnegative().default(0),
        sceneCount: z.number().int().nonnegative().default(0),
        createdAt: timestampSchema
    })
    .meta({ id: "ScreenplayVersion" });

export const createScreenplayVersionSchema = z
    .object({
        name: z.string().trim().min(1).max(150),
        content: z.record(z.string(), z.any()).or(z.array(z.any())),
        wordCount: z.number().int().nonnegative().default(0).optional(),
        sceneCount: z.number().int().nonnegative().default(0).optional()
    })
    .meta({ id: "CreateScreenplayVersion" });

export const screenplaySummarySchema = z
    .object({
        id: uuidSchema,
        ownerId: uuidSchema,
        owner: userSummarySchema.optional(),
        title: z.string().min(1).max(200),
        shelfId: uuidSchema.nullable(),
        category: z.string().nullable(),
        wordCount: z.number().int().nonnegative(),
        sceneCount: z.number().int().nonnegative(),
        userRole: z.enum(["owner", "editor", "viewer"]).optional(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "ScreenplaySummary" });

export const screenplaySchema = z
    .object({
        id: uuidSchema,
        ownerId: uuidSchema,
        owner: userSummarySchema.optional(),
        title: z.string().min(1).max(200),
        content: z.record(z.string(), z.any()).or(z.array(z.any())),
        titlePage: z.record(z.string(), z.any()).nullable(),
        shelfId: uuidSchema.nullable(),
        category: z.string().nullable(),
        wordCount: z.number().int().nonnegative(),
        sceneCount: z.number().int().nonnegative(),
        userRole: z.enum(["owner", "editor", "viewer"]).optional(),
        collaborators: z.array(screenplayCollaboratorSchema).optional(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Screenplay" });

export const createScreenplaySchema = z
    .object({
        title: z.string().trim().min(1).max(200).default("Untitled Screenplay"),
        content: z.record(z.string(), z.any()).or(z.array(z.any())).optional(),
        titlePage: z.record(z.string(), z.any()).nullable().optional(),
        shelfId: uuidSchema.nullable().optional(),
        category: z.string().max(100).nullable().optional(),
        wordCount: z.number().int().nonnegative().default(0).optional(),
        sceneCount: z.number().int().nonnegative().default(0).optional()
    })
    .meta({ id: "CreateScreenplay" });

export const updateScreenplaySchema = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        content: z.record(z.string(), z.any()).or(z.array(z.any())).optional(),
        titlePage: z.record(z.string(), z.any()).nullable().optional(),
        shelfId: uuidSchema.nullable().optional(),
        category: z.string().max(100).nullable().optional(),
        wordCount: z.number().int().nonnegative().optional(),
        sceneCount: z.number().int().nonnegative().optional()
    })
    .meta({ id: "UpdateScreenplay" });

export const screenplayEventSchema = z
    .discriminatedUnion("type", [
        z.object({
            type: z.literal("script.updated"),
            scriptId: uuidSchema,
            userId: uuidSchema,
            updatedAt: timestampSchema,
            title: z.string().optional(),
            content: z.record(z.string(), z.any()).or(z.array(z.any())).optional(),
            titlePage: z.record(z.string(), z.any()).nullable().optional(),
            wordCount: z.number().int().nonnegative().optional(),
            sceneCount: z.number().int().nonnegative().optional()
        }),
        z.object({
            type: z.literal("script.version_created"),
            scriptId: uuidSchema,
            versionId: uuidSchema,
            name: z.string(),
            userId: uuidSchema,
            occurredAt: timestampSchema
        })
    ])
    .meta({ id: "ScreenplayEvent" });

export type ScreenplayShelfDto = z.infer<typeof screenplayShelfSchema>;
export type CreateScreenplayShelfDto = z.input<typeof createScreenplayShelfSchema>;
export type ScreenplayCollaboratorDto = z.infer<typeof screenplayCollaboratorSchema>;
export type AddScreenplayCollaboratorDto = z.input<typeof addScreenplayCollaboratorSchema>;
export type ScreenplayVersionDto = z.infer<typeof screenplayVersionSchema>;
export type CreateScreenplayVersionDto = z.input<typeof createScreenplayVersionSchema>;
export type ScreenplaySummaryDto = z.infer<typeof screenplaySummarySchema>;
export type ScreenplayDto = z.infer<typeof screenplaySchema>;
export type CreateScreenplayDto = z.input<typeof createScreenplaySchema>;
export type UpdateScreenplayDto = z.input<typeof updateScreenplaySchema>;
export type ScreenplayEventDto = z.infer<typeof screenplayEventSchema>;

export const discordSettingsSchema = z
    .object({
        guildId: snowflakeSchema,
        channels: z.record(z.string(), snowflakeSchema).default({}),
        webhooks: z.record(z.string(), z.string()).default({}),
        roles: z.record(z.string(), snowflakeSchema).default({}),
        forumTags: z.record(z.string(), snowflakeSchema).default({}),
        notificationCursor: z.string().nullable().default(null),
        rulesMessageId: snowflakeSchema.nullable().default(null),
        createdAt: timestampSchema.optional(),
        updatedAt: timestampSchema.optional()
    })
    .meta({ id: "DiscordSettings" });

export const updateDiscordSettingsSchema = z
    .object({
        channels: z.record(z.string(), snowflakeSchema).optional(),
        webhooks: z.record(z.string(), z.string()).optional(),
        roles: z.record(z.string(), snowflakeSchema).optional(),
        forumTags: z.record(z.string(), snowflakeSchema).optional(),
        notificationCursor: z.string().nullable().optional(),
        rulesMessageId: snowflakeSchema.nullable().optional()
    })
    .meta({ id: "UpdateDiscordSettings" });

export type DiscordSettingsDto = z.infer<typeof discordSettingsSchema>;
export type UpdateDiscordSettingsDto = z.input<typeof updateDiscordSettingsSchema>;

export const infractionSchema = z
    .object({
        id: z.string(),
        timestamp: z.string(),
        reason: z.string(),
        channelId: z.string(),
        messageSnippet: z.string()
    })
    .meta({ id: "Infraction" });

export const timeoutRecordSchema = z
    .object({
        id: z.string(),
        timestamp: z.string(),
        durationMs: z.number(),
        reason: z.string(),
        level: z.number().default(1)
    })
    .meta({ id: "TimeoutRecord" });

export const apologyRecordSchema = z
    .object({
        status: z.enum(["none", "pending", "approved", "rejected"]).default("none"),
        text: z.string().nullable().default(null),
        submittedAt: z.string().nullable().default(null),
        reviewedBy: z.string().nullable().optional(),
        reviewedAt: z.string().nullable().optional()
    })
    .meta({ id: "ApologyRecord" });

export const userModerationRecordSchema = z
    .object({
        userId: snowflakeSchema,
        offenceLevel: z.number().int().default(0),
        stageWarnings: z.number().int().default(0),
        infractions: z.array(infractionSchema).default([]),
        timeouts: z.array(timeoutRecordSchema).default([]),
        apology: apologyRecordSchema.default({ status: "none", text: null, submittedAt: null }),
        createdAt: timestampSchema.optional(),
        updatedAt: timestampSchema.optional()
    })
    .meta({ id: "UserModerationRecord" });

export const updateUserModerationRecordSchema = z
    .object({
        offenceLevel: z.number().int().optional(),
        stageWarnings: z.number().int().optional(),
        infractions: z.array(infractionSchema).optional(),
        timeouts: z.array(timeoutRecordSchema).optional(),
        apology: apologyRecordSchema.optional()
    })
    .meta({ id: "UpdateUserModerationRecord" });

export type InfractionDto = z.infer<typeof infractionSchema>;
export type TimeoutRecordDto = z.infer<typeof timeoutRecordSchema>;
export type ApologyRecordDto = z.infer<typeof apologyRecordSchema>;
export type UserModerationRecordDto = z.infer<typeof userModerationRecordSchema>;
export type UpdateUserModerationRecordDto = z.input<typeof updateUserModerationRecordSchema>;

export const announcementPingsSchema = z
    .object({
        everyone: z.boolean().optional(),
        here: z.boolean().optional(),
        roleIds: z.array(snowflakeSchema).max(20).optional(),
        userIds: z.array(snowflakeSchema).max(50).optional()
    })
    .meta({ id: "AnnouncementPings" });

export type AnnouncementPingsDto = z.infer<typeof announcementPingsSchema>;

export const publishAnnouncementSchema = z
    .object({
        target: z.string().min(1).max(64),
        title: z.string().min(1).max(256),
        content: z.string().min(1).max(4000),
        pings: announcementPingsSchema.optional()
    })
    .meta({ id: "PublishAnnouncement" });

export type PublishAnnouncementDto = z.infer<typeof publishAnnouncementSchema>;

export const announcementPublishResultSchema = z
    .object({
        target: z.string(),
        dispatchedCount: z.number().int(),
        channels: z.array(z.string())
    })
    .meta({ id: "AnnouncementPublishResult" });

export type AnnouncementPublishResultDto = z.infer<typeof announcementPublishResultSchema>;
