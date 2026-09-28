import { z } from "zod";
import {
    DifficultyTier,
    DocumentSlug,
    documentLimits,
    EntryStatus,
    PollType,
    RaidFlag,
    RaidSeverity,
    Role,
    RoundStatus,
    SeparationAction,
    SeparationStatus,
    ShotStatus,
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

export const entrySchema = z
    .object({
        id: uuidSchema,
        roundId: uuidSchema,
        title: z.string(),
        description: z.string().nullable(),
        status: z.enum(EntryStatus),
        isQuarantined: z.boolean(),
        mediaUrl: z.url().nullable(),
        submittedBy: uuidSchema.nullable(),
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
        voter: z.string().describe("Pseudonymous voter identifier, stable within a round."),
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
        status: z.enum(ShotStatus),
        claimer: userSummarySchema.nullable(),
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
export type ShotDto = z.infer<typeof shotSchema>;
export type SubmissionDto = z.infer<typeof submissionSchema>;
export type ShotDetailDto = z.infer<typeof shotDetailSchema>;
export type ReviewQueueItemDto = z.infer<typeof reviewQueueItemSchema>;
export type PresignedUploadDto = z.infer<typeof presignedUploadSchema>;
export type ShotThreadMapDto = z.infer<typeof shotThreadMapSchema>;
export type ReclaimResultDto = z.infer<typeof reclaimResultSchema>;
export type PipelineProgressDto = z.infer<typeof pipelineProgressSchema>;

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
