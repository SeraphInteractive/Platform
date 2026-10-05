import { sql } from "drizzle-orm";
import {
    boolean,
    check,
    doublePrecision,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar
} from "drizzle-orm/pg-core";
import { RaidSeverity, type PairwiseSeparation, type RaidFlag } from "@platform/scoring";
import { DifficultyTier, EntryStatus, enumValues, PollType, RoundStatus, ShotStatus, SubmissionStatus } from "../../Domain/Enums.js";
import { Role, Specialty } from "../../Domain/Roles.js";
import type { LeaderboardItem } from "../../Modules/Leaderboards/LeaderboardTypes.js";

const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date())
};

export const roleEnum = pgEnum("user_role", enumValues(Role));
export const specialtyEnum = pgEnum("user_specialty", enumValues(Specialty));
export const roundStatusEnum = pgEnum("round_status", enumValues(RoundStatus));
export const pollTypeEnum = pgEnum("poll_type", enumValues(PollType));
export const entryStatusEnum = pgEnum("entry_status", enumValues(EntryStatus));
export const difficultyTierEnum = pgEnum("difficulty_tier", enumValues(DifficultyTier));
export const shotStatusEnum = pgEnum("shot_status", enumValues(ShotStatus));
export const submissionStatusEnum = pgEnum("submission_status", enumValues(SubmissionStatus));
export const raidSeverityEnum = pgEnum("raid_severity", enumValues(RaidSeverity));

export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        discordId: varchar("discord_id", { length: 20 }).notNull().unique(),
        discordUsername: varchar("discord_username", { length: 64 }).notNull(),
        discordAvatar: varchar("discord_avatar", { length: 64 }),
        role: roleEnum("role").notNull(),
        specialties: specialtyEnum("specialties")
            .array()
            .notNull()
            .default(sql`'{}'`),
        isBlacklisted: boolean("is_blacklisted").notNull().default(false),
        blacklistReason: varchar("blacklist_reason", { length: 500 }),
        blacklistedAt: timestamp("blacklisted_at", { withTimezone: true }),
        onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
        termsVersion: varchar("terms_version", { length: 32 }),
        termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
        verifiedEmailHash: varchar("verified_email_hash", { length: 64 }).unique(),
        emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
        ...timestamps
    },
    (table) => [
        index("users_created_at_idx").on(table.createdAt),
        check("users_specialties_limit", sql`cardinality(${table.specialties}) <= 3`)
    ]
);

export const accessTokens = pgTable(
    "access_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("access_tokens_user_id_idx").on(table.userId), index("access_tokens_expires_at_idx").on(table.expiresAt)]
);

export const votingRounds = pgTable(
    "voting_rounds",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        title: varchar("title", { length: 255 }).notNull(),
        status: roundStatusEnum("status").notNull().default(RoundStatus.Draft),
        pollType: pollTypeEnum("poll_type").notNull().default(PollType.RankedChoice),
        opensAt: timestamp("opens_at", { withTimezone: true }),
        closesAt: timestamp("closes_at", { withTimezone: true }),
        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id),
        ...timestamps
    },
    (table) => [
        index("voting_rounds_status_created_at_idx").on(table.status, table.createdAt),
        check("voting_rounds_window", sql`${table.opensAt} IS NULL OR ${table.closesAt} IS NULL OR ${table.closesAt} > ${table.opensAt}`)
    ]
);

export const entries = pgTable(
    "entries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        roundId: uuid("round_id")
            .notNull()
            .references(() => votingRounds.id, { onDelete: "cascade" }),
        title: varchar("title", { length: 255 }).notNull(),
        description: varchar("description", { length: 1500 }),
        submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }),
        status: entryStatusEnum("status").notNull().default(EntryStatus.PendingReview),
        mediaKey: varchar("media_key", { length: 255 }),
        isQuarantined: boolean("is_quarantined").notNull().default(false),
        aiFlags: jsonb("ai_flags").$type<string[]>().notNull().default([]),
        ...timestamps
    },
    (table) => [index("entries_round_status_idx").on(table.roundId, table.status, table.createdAt)]
);

export const ballots = pgTable(
    "ballots",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        roundId: uuid("round_id")
            .notNull()
            .references(() => votingRounds.id, { onDelete: "cascade" }),
        voterId: uuid("voter_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        rank1EntryId: uuid("rank1_entry_id")
            .notNull()
            .references(() => entries.id),
        rank2EntryId: uuid("rank2_entry_id").references(() => entries.id),
        rank3EntryId: uuid("rank3_entry_id").references(() => entries.id),
        ...timestamps
    },
    (table) => [
        unique("ballots_round_voter_unique").on(table.roundId, table.voterId),
        index("ballots_round_created_at_idx").on(table.roundId, table.createdAt),
        index("ballots_rank1_idx").on(table.rank1EntryId),
        index("ballots_rank2_idx").on(table.rank2EntryId),
        index("ballots_rank3_idx").on(table.rank3EntryId),
        check(
            "ballots_distinct_picks",
            sql`${table.rank1EntryId} IS DISTINCT FROM ${table.rank2EntryId} AND ${table.rank1EntryId} IS DISTINCT FROM ${table.rank3EntryId} AND (${table.rank2EntryId} IS NULL OR ${table.rank2EntryId} IS DISTINCT FROM ${table.rank3EntryId})`
        ),
        check("ballots_pick_shape", sql`(${table.rank2EntryId} IS NULL) = (${table.rank3EntryId} IS NULL)`)
    ]
);

export const raidTelemetry = pgTable(
    "raid_telemetry",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        entryId: uuid("entry_id")
            .notNull()
            .references(() => entries.id, { onDelete: "cascade" }),
        roundId: uuid("round_id")
            .notNull()
            .references(() => votingRounds.id, { onDelete: "cascade" }),
        compositeScore: doublePrecision("composite_score").notNull(),
        severity: raidSeverityEnum("severity").notNull(),
        skewRatio: doublePrecision("skew_ratio").notNull(),
        rankEntropy: doublePrecision("rank_entropy").notNull(),
        velocityZScore: doublePrecision("velocity_z_score").notNull(),
        flags: text("flags")
            .array()
            .$type<RaidFlag[]>()
            .notNull()
            .default(sql`'{}'`),
        breakdown: jsonb("breakdown").$type<{ topRankPoints: number; lowerRankPoints: number; topRankShare: number }>().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("raid_telemetry_round_entry_created_idx").on(table.roundId, table.entryId, table.createdAt.desc())]
);

export const roundResults = pgTable("round_results", {
    id: uuid("id").primaryKey().defaultRandom(),
    roundId: uuid("round_id")
        .notNull()
        .unique()
        .references(() => votingRounds.id, { onDelete: "cascade" }),
    totalBallots: integer("total_ballots").notNull(),
    totalPoints: integer("total_points").notNull(),
    isConserved: boolean("is_conserved").notNull(),
    leaderboard: jsonb("leaderboard").$type<LeaderboardItem[]>().notNull(),
    separationResults: jsonb("separation_results").$type<PairwiseSeparation[]>().notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedBy: uuid("finalized_by")
        .notNull()
        .references(() => users.id)
});

export const shots = pgTable(
    "shots",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        roundId: uuid("round_id").references(() => votingRounds.id, { onDelete: "set null" }),
        sceneNumber: integer("scene_number").notNull(),
        shotCode: varchar("shot_code", { length: 50 }).notNull().unique(),
        title: varchar("title", { length: 255 }).notNull(),
        description: varchar("description", { length: 5000 }),
        difficultyTier: difficultyTierEnum("difficulty_tier").notNull(),
        status: shotStatusEnum("status").notNull().default(ShotStatus.Available),
        claimedBy: uuid("claimed_by").references(() => users.id, { onDelete: "set null" }),
        claimedAt: timestamp("claimed_at", { withTimezone: true }),
        deadlineAt: timestamp("deadline_at", { withTimezone: true }),
        seniorPriorityUntil: timestamp("senior_priority_until", { withTimezone: true }),
        imageKeys: text("image_keys")
            .array()
            .notNull()
            .default(sql`'{}'`),
        ...timestamps
    },
    (table) => [
        index("shots_listing_idx").on(table.sceneNumber, table.shotCode),
        index("shots_status_idx").on(table.status),
        index("shots_deadline_idx")
            .on(table.deadlineAt)
            .where(sql`${table.status} = 'claimed'`),
        uniqueIndex("shots_one_active_claim_per_user")
            .on(table.claimedBy)
            .where(sql`${table.status} IN ('claimed', 'submitted')`),
        check("shots_scene_number_positive", sql`${table.sceneNumber} > 0`),
        check("shots_image_keys_limit", sql`cardinality(${table.imageKeys}) <= 4`),
        check(
            "shots_active_claim_consistency",
            sql`${table.status} NOT IN ('claimed', 'submitted') OR (${table.claimedBy} IS NOT NULL AND ${table.claimedAt} IS NOT NULL)`
        )
    ]
);

export const submissions = pgTable(
    "submissions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        shotId: uuid("shot_id")
            .notNull()
            .references(() => shots.id, { onDelete: "cascade" }),
        contributorId: uuid("contributor_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        version: integer("version").notNull(),
        videoKey: varchar("video_key", { length: 512 }).notNull(),
        blendKey: varchar("blend_key", { length: 512 }),
        notes: varchar("notes", { length: 2000 }),
        status: submissionStatusEnum("status").notNull().default(SubmissionStatus.PendingReview),
        supervisorNotes: varchar("supervisor_notes", { length: 2000 }),
        reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
        reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
        aiFlags: jsonb("ai_flags").$type<string[]>().notNull().default([]),
        ...timestamps
    },
    (table) => [
        unique("submissions_shot_version_unique").on(table.shotId, table.version),
        index("submissions_status_created_idx").on(table.status, table.createdAt),
        index("submissions_contributor_idx").on(table.contributorId)
    ]
);

export const shotThreadMaps = pgTable("shot_thread_maps", {
    shotId: uuid("shot_id")
        .primaryKey()
        .references(() => shots.id, { onDelete: "cascade" }),
    discordThreadId: varchar("discord_thread_id", { length: 20 }).notNull().unique(),
    ...timestamps
});

export const pipelineProgress = pgTable(
    "pipeline_progress",
    {
        id: integer("id").primaryKey().default(1),
        stepIndex: integer("step_index").notNull(),
        stepId: varchar("step_id", { length: 32 }).notNull(),
        stepTitle: varchar("step_title", { length: 128 }).notNull(),
        phaseNumber: integer("phase_number").notNull(),
        phaseTitle: varchar("phase_title", { length: 128 }).notNull(),
        progressPercent: doublePrecision("progress_percent").notNull(),
        isPhaseTransition: boolean("is_phase_transition").notNull(),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        ...timestamps
    },
    (table) => [
        check("pipeline_progress_singleton", sql`${table.id} = 1`),
        check("pipeline_progress_percent_range", sql`${table.progressPercent} BETWEEN 0 AND 100`)
    ]
);

export interface StoredDocumentSection {
    readonly id: string;
    readonly title: string;
    readonly html: string;
}

export const documents = pgTable("documents", {
    slug: varchar("slug", { length: 32 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    sections: jsonb("sections").$type<StoredDocumentSection[]>().notNull(),
    revision: integer("revision").notNull(),
    acceptanceVersion: varchar("acceptance_version", { length: 32 }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps
});

export const documentRevisions = pgTable(
    "document_revisions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        slug: varchar("slug", { length: 32 })
            .notNull()
            .references(() => documents.slug, { onDelete: "cascade" }),
        revision: integer("revision").notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        sections: jsonb("sections").$type<StoredDocumentSection[]>().notNull(),
        requiresReacceptance: boolean("requires_reacceptance").notNull().default(false),
        note: varchar("note", { length: 500 }),
        authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [uniqueIndex("document_revisions_slug_revision").on(table.slug, table.revision)]
);

export const deletedStorageObjects = pgTable(
    "deleted_storage_objects",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        bucket: varchar("bucket", { length: 32 }).notNull(),
        objectKey: varchar("object_key", { length: 512 }).notNull(),
        scheduledDeleteAt: timestamp("scheduled_delete_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("deleted_storage_objects_scheduled_idx").on(table.scheduledDeleteAt)]
);

export type UserRecord = typeof users.$inferSelect;
export type DocumentRecord = typeof documents.$inferSelect;
export type DocumentRevisionRecord = typeof documentRevisions.$inferSelect;
export type VotingRoundRecord = typeof votingRounds.$inferSelect;
export type EntryRecord = typeof entries.$inferSelect;
export type BallotRecord = typeof ballots.$inferSelect;
export type RaidTelemetryRecord = typeof raidTelemetry.$inferSelect;
export type RoundResultRecord = typeof roundResults.$inferSelect;
export type ShotRecord = typeof shots.$inferSelect;
export type SubmissionRecord = typeof submissions.$inferSelect;
export type ShotThreadMapRecord = typeof shotThreadMaps.$inferSelect;
export type PipelineProgressRecord = typeof pipelineProgress.$inferSelect;
export type DeletedStorageObjectRecord = typeof deletedStorageObjects.$inferSelect;
