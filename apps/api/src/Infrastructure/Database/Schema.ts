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
import {
    ApplicationStage,
    FeedbackOutcome,
    FeedbackSurveyStatus,
    PositionStatus,
    TicketEventKind,
    TicketHubStyle,
    TicketKind,
    TicketMessageSource,
    TicketStatus,
    type DiscordDirectoryChannelDto,
    type FeedbackQuestionDto,
    type DiscordDirectoryMemberDto,
    type DiscordDirectoryRoleDto,
    type InfractionDto,
    type TicketAnswerDto,
    type TicketAttachmentDto,
    type TicketListingDto,
    type TicketMessagesDto,
    type TicketQuestionDto,
    type TimeoutRecordDto
} from "@platform/contracts";
import {
    DifficultyTier,
    EntryStatus,
    enumValues,
    PollType,
    RoundStatus,
    ScreenplayRole,
    ShotStatus,
    ShotType,
    SubmissionStatus
} from "../../Domain/Enums.js";
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
export const shotTypeEnum = pgEnum("shot_type", enumValues(ShotType));
export const roundStatusEnum = pgEnum("round_status", enumValues(RoundStatus));
export const pollTypeEnum = pgEnum("poll_type", enumValues(PollType));
export const entryStatusEnum = pgEnum("entry_status", enumValues(EntryStatus));
export const difficultyTierEnum = pgEnum("difficulty_tier", enumValues(DifficultyTier));
export const shotStatusEnum = pgEnum("shot_status", enumValues(ShotStatus));
export const submissionStatusEnum = pgEnum("submission_status", enumValues(SubmissionStatus));
export const raidSeverityEnum = pgEnum("raid_severity", enumValues(RaidSeverity));
export const screenplayRoleEnum = pgEnum("screenplay_role", enumValues(ScreenplayRole));

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

export const departments = pgTable("departments", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 32 }).notNull().unique(),
    supervisorSpecialties: specialtyEnum("supervisor_specialties")
        .array()
        .notNull()
        .default(sql`'{}'::user_specialty[]`),
    contributorSpecialties: specialtyEnum("contributor_specialties")
        .array()
        .notNull()
        .default(sql`'{}'::user_specialty[]`),
    shotTypes: shotTypeEnum("shot_types")
        .array()
        .notNull()
        .default(sql`'{}'::shot_type[]`),
    ...timestamps
});

export const departmentDiscordMaps = pgTable("department_discord_maps", {
    departmentId: uuid("department_id")
        .primaryKey()
        .references(() => departments.id, { onDelete: "cascade" }),
    discordCategoryId: varchar("discord_category_id", { length: 20 }).notNull().unique(),
    discordForumId: varchar("discord_forum_id", { length: 20 }).notNull().unique(),
    discordChatChannelId: varchar("discord_chat_channel_id", { length: 20 }).unique(),
    discordInfoChannelId: varchar("discord_info_channel_id", { length: 20 }),
    discordInfoWebhookUrl: text("discord_info_webhook_url"),
    discordLogsChannelId: varchar("discord_logs_channel_id", { length: 20 }),
    discordLogsWebhookUrl: text("discord_logs_webhook_url"),
    discordApplyChannelId: varchar("discord_apply_channel_id", { length: 20 }),
    ...timestamps
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
        shotType: shotTypeEnum("shot_type").notNull().default(ShotType.Animation),
        departmentId: uuid("department_id").references(() => departments.id, { onDelete: "restrict" }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
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

export const discordSettings = pgTable("discord_settings", {
    guildId: varchar("guild_id", { length: 20 }).primaryKey(),
    channels: jsonb("channels")
        .$type<Record<string, string>>()
        .notNull()
        .default(sql`'{}'::jsonb`),
    webhooks: jsonb("webhooks")
        .$type<Record<string, string>>()
        .notNull()
        .default(sql`'{}'::jsonb`),
    roles: jsonb("roles")
        .$type<Record<string, string>>()
        .notNull()
        .default(sql`'{}'::jsonb`),
    forumTags: jsonb("forum_tags")
        .$type<Record<string, string>>()
        .notNull()
        .default(sql`'{}'::jsonb`),
    notificationCursor: varchar("notification_cursor", { length: 64 }),
    rulesMessageId: varchar("rules_message_id", { length: 20 }),
    ...timestamps
});

export const discordModerationRecords = pgTable(
    "discord_moderation_records",
    {
        userId: varchar("discord_user_id", { length: 20 }).primaryKey(),
        offenceLevel: integer("offence_level").notNull().default(0),
        stageWarnings: integer("stage_warnings").notNull().default(0),
        infractions: jsonb("infractions")
            .$type<InfractionDto[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        timeouts: jsonb("timeouts")
            .$type<TimeoutRecordDto[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        apologyStatus: varchar("apology_status", { length: 20 }).notNull().default("none"),
        apologyText: text("apology_text"),
        apologySubmittedAt: timestamp("apology_submitted_at", { withTimezone: true }),
        apologyReviewedBy: varchar("apology_reviewed_by", { length: 20 }),
        apologyReviewedAt: timestamp("apology_reviewed_at", { withTimezone: true }),
        ...timestamps
    },
    (table) => [
        index("discord_moderation_records_offence_level_idx").on(table.offenceLevel),
        index("discord_moderation_records_apology_status_idx").on(table.apologyStatus)
    ]
);

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

export const automodRules = pgTable(
    "automod_rules",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        pattern: varchar("pattern", { length: 255 }).notNull(),
        isRegex: boolean("is_regex").notNull().default(false),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        ...timestamps
    },
    (table) => [index("automod_rules_created_at_idx").on(table.createdAt)]
);

export const screenplayShelves = pgTable(
    "screenplay_shelves",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("screenplay_shelves_user_id_idx").on(table.userId)]
);

export const screenplays = pgTable(
    "screenplays",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ownerId: uuid("owner_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        title: varchar("title", { length: 200 }).notNull().default("Untitled Screenplay"),
        content: jsonb("content")
            .notNull()
            .default(sql`'{}'::jsonb`),
        titlePage: jsonb("title_page"),
        shelfId: uuid("shelf_id").references(() => screenplayShelves.id, { onDelete: "set null" }),
        category: varchar("category", { length: 100 }),
        wordCount: integer("word_count").notNull().default(0),
        sceneCount: integer("scene_count").notNull().default(0),
        ...timestamps
    },
    (table) => [
        index("screenplays_owner_id_idx").on(table.ownerId),
        index("screenplays_shelf_id_idx").on(table.shelfId),
        index("screenplays_updated_at_idx").on(table.updatedAt)
    ]
);

export const screenplayCollaborators = pgTable(
    "screenplay_collaborators",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        screenplayId: uuid("screenplay_id")
            .notNull()
            .references(() => screenplays.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: screenplayRoleEnum("role").notNull().default(ScreenplayRole.Editor),
        invitedBy: uuid("invited_by")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        uniqueIndex("screenplay_collaborators_script_user_idx").on(table.screenplayId, table.userId),
        index("screenplay_collaborators_user_id_idx").on(table.userId)
    ]
);

export const screenplayVersions = pgTable(
    "screenplay_versions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        screenplayId: uuid("screenplay_id")
            .notNull()
            .references(() => screenplays.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 150 }).notNull(),
        content: jsonb("content").notNull(),
        wordCount: integer("word_count").notNull().default(0),
        sceneCount: integer("scene_count").notNull().default(0),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        index("screenplay_versions_script_id_created_at_idx").on(table.screenplayId, table.createdAt),
        index("screenplay_versions_user_id_idx").on(table.userId)
    ]
);

export const ticketKindEnum = pgEnum("ticket_kind", enumValues(TicketKind));
export const ticketStatusEnum = pgEnum("ticket_status", enumValues(TicketStatus));
export const applicationStageEnum = pgEnum("application_stage", enumValues(ApplicationStage));
export const positionStatusEnum = pgEnum("position_status", enumValues(PositionStatus));
export const ticketHubStyleEnum = pgEnum("ticket_hub_style", enumValues(TicketHubStyle));
export const ticketEventKindEnum = pgEnum("ticket_event_kind", enumValues(TicketEventKind));
export const ticketMessageSourceEnum = pgEnum("ticket_message_source", enumValues(TicketMessageSource));

export const ticketSettings = pgTable(
    "ticket_settings",
    {
        id: integer("id").primaryKey().default(1),
        guildId: varchar("guild_id", { length: 20 }),
        logChannelId: varchar("log_channel_id", { length: 20 }),
        logEvents: text("log_events")
            .array()
            .$type<TicketEventKind[]>()
            .notNull()
            .default(sql`'{opened,stage_changed,closed,reopened}'`),
        transcriptOnClose: boolean("transcript_on_close").notNull().default(true),
        dmApplicants: boolean("dm_applicants").notNull().default(true),
        maxOpenPerUser: integer("max_open_per_user").notNull().default(3),
        ...timestamps
    },
    (table) => [
        check("ticket_settings_singleton", sql`${table.id} = 1`),
        check("ticket_settings_max_open_range", sql`${table.maxOpenPerUser} BETWEEN 1 AND 25`)
    ]
);

export const ticketCategories = pgTable(
    "ticket_categories",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 80 }).notNull(),
        description: varchar("description", { length: 300 }),
        emoji: varchar("emoji", { length: 64 }),
        position: integer("position").notNull().default(0),
        isEnabled: boolean("is_enabled").notNull().default(true),
        threadChannelId: varchar("thread_channel_id", { length: 20 }),
        notificationChannelId: varchar("notification_channel_id", { length: 20 }),
        logChannelId: varchar("log_channel_id", { length: 20 }),
        staffRoleIds: text("staff_role_ids")
            .array()
            .notNull()
            .default(sql`'{}'`),
        mentionStaff: boolean("mention_staff").notNull().default(true),
        departmentId: uuid("department_id")
            .references(() => departments.id, { onDelete: "set null" })
            .unique(),
        ...timestamps
    },
    (table) => [index("ticket_categories_position_idx").on(table.position, table.createdAt)]
);

export const ticketTypes = pgTable(
    "ticket_types",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        categoryId: uuid("category_id")
            .notNull()
            .references(() => ticketCategories.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 80 }).notNull(),
        description: varchar("description", { length: 100 }),
        emoji: varchar("emoji", { length: 64 }),
        kind: ticketKindEnum("kind").notNull(),
        position: integer("position").notNull().default(0),
        isEnabled: boolean("is_enabled").notNull().default(true),
        staffRoleIds: text("staff_role_ids")
            .array()
            .notNull()
            .default(sql`'{}'`),
        threadChannelId: varchar("thread_channel_id", { length: 20 }),
        mentionStaff: boolean("mention_staff").notNull().default(true),
        questions: jsonb("questions").$type<TicketQuestionDto[]>().notNull().default([]),
        positionStatus: positionStatusEnum("position_status").notNull().default(PositionStatus.Open),
        openings: integer("openings"),
        filledCount: integer("filled_count").notNull().default(0),
        opensAt: timestamp("opens_at", { withTimezone: true }),
        closesAt: timestamp("closes_at", { withTimezone: true }),
        listing: jsonb("listing").$type<TicketListingDto>(),
        messages: jsonb("messages").$type<TicketMessagesDto>().notNull().default({ interview: null, accepted: null, rejected: null }),
        ...timestamps
    },
    (table) => [
        index("ticket_types_category_position_idx").on(table.categoryId, table.position, table.createdAt),
        check("ticket_types_openings_positive", sql`${table.openings} IS NULL OR ${table.openings} > 0`),
        check("ticket_types_filled_count_non_negative", sql`${table.filledCount} >= 0`),
        check("ticket_types_window", sql`${table.opensAt} IS NULL OR ${table.closesAt} IS NULL OR ${table.closesAt} > ${table.opensAt}`)
    ]
);

export const ticketHubs = pgTable(
    "ticket_hubs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 80 }).notNull(),
        channelId: varchar("channel_id", { length: 20 }),
        messageId: varchar("message_id", { length: 20 }),
        title: varchar("title", { length: 100 }).notNull(),
        description: varchar("description", { length: 2000 }).notNull().default(""),
        color: integer("color"),
        style: ticketHubStyleEnum("style").notNull().default(TicketHubStyle.Buttons),
        categoryIds: uuid("category_ids")
            .array()
            .notNull()
            .default(sql`'{}'`),
        isEnabled: boolean("is_enabled").notNull().default(true),
        departmentId: uuid("department_id")
            .references(() => departments.id, { onDelete: "set null" })
            .unique(),
        ...timestamps
    },
    (table) => [
        index("ticket_hubs_created_idx").on(table.createdAt),
        check("ticket_hubs_color_range", sql`${table.color} IS NULL OR ${table.color} BETWEEN 0 AND 16777215`)
    ]
);

export const tickets = pgTable(
    "tickets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        number: integer("number").generatedAlwaysAsIdentity().notNull().unique(),
        typeId: uuid("type_id").references(() => ticketTypes.id, { onDelete: "set null" }),
        categoryId: uuid("category_id").references(() => ticketCategories.id, { onDelete: "set null" }),
        typeName: varchar("type_name", { length: 80 }).notNull(),
        categoryName: varchar("category_name", { length: 80 }).notNull(),
        kind: ticketKindEnum("kind").notNull(),
        status: ticketStatusEnum("status").notNull().default(TicketStatus.Open),
        stage: applicationStageEnum("stage"),
        openerDiscordId: varchar("opener_discord_id", { length: 20 }).notNull(),
        openerUsername: varchar("opener_username", { length: 64 }).notNull(),
        assigneeDiscordId: varchar("assignee_discord_id", { length: 20 }),
        assigneeUsername: varchar("assignee_username", { length: 64 }),
        threadId: varchar("thread_id", { length: 20 }).unique(),
        introMessageId: varchar("intro_message_id", { length: 20 }),
        notificationChannelId: varchar("notification_channel_id", { length: 20 }),
        notificationMessageId: varchar("notification_message_id", { length: 20 }),
        answers: jsonb("answers").$type<TicketAnswerDto[]>().notNull().default([]),
        decidedByDiscordId: varchar("decided_by_discord_id", { length: 20 }),
        decidedByUsername: varchar("decided_by_username", { length: 64 }),
        decidedAt: timestamp("decided_at", { withTimezone: true }),
        decisionNote: varchar("decision_note", { length: 1000 }),
        closedByDiscordId: varchar("closed_by_discord_id", { length: 20 }),
        closedByUsername: varchar("closed_by_username", { length: 64 }),
        closedAt: timestamp("closed_at", { withTimezone: true }),
        closeReason: varchar("close_reason", { length: 1000 }),
        lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
        ...timestamps
    },
    (table) => [
        index("tickets_status_activity_idx").on(table.status, table.lastActivityAt),
        index("tickets_type_status_idx").on(table.typeId, table.status),
        index("tickets_category_created_idx").on(table.categoryId, table.createdAt),
        index("tickets_opener_idx").on(table.openerDiscordId, table.status),
        index("tickets_assignee_idx").on(table.assigneeDiscordId, table.status),
        uniqueIndex("tickets_one_open_per_opener_type")
            .on(table.typeId, table.openerDiscordId)
            .where(sql`${table.status} = 'open'`),
        check("tickets_stage_matches_kind", sql`(${table.kind} = 'application') = (${table.stage} IS NOT NULL)`)
    ]
);

export const ticketEvents = pgTable(
    "ticket_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ticketId: uuid("ticket_id")
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        kind: ticketEventKindEnum("kind").notNull(),
        actorDiscordId: varchar("actor_discord_id", { length: 20 }),
        actorUsername: varchar("actor_username", { length: 64 }),
        stage: applicationStageEnum("stage"),
        targetDiscordId: varchar("target_discord_id", { length: 20 }),
        targetUsername: varchar("target_username", { length: 64 }),
        note: varchar("note", { length: 2000 }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("ticket_events_ticket_created_idx").on(table.ticketId, table.createdAt)]
);

export const ticketMessages = pgTable(
    "ticket_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        ticketId: uuid("ticket_id")
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        discordMessageId: varchar("discord_message_id", { length: 20 }).unique(),
        source: ticketMessageSourceEnum("source").notNull(),
        authorDiscordId: varchar("author_discord_id", { length: 20 }).notNull(),
        authorUsername: varchar("author_username", { length: 64 }).notNull(),
        authorAvatarUrl: varchar("author_avatar_url", { length: 512 }),
        content: text("content").notNull().default(""),
        attachments: jsonb("attachments").$type<TicketAttachmentDto[]>().notNull().default([]),
        editedAt: timestamp("edited_at", { withTimezone: true }),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [index("ticket_messages_ticket_created_idx").on(table.ticketId, table.createdAt)]
);

export const discordDirectory = pgTable(
    "discord_directory",
    {
        id: integer("id").primaryKey().default(1),
        guildId: varchar("guild_id", { length: 20 }).notNull(),
        channels: jsonb("channels").$type<DiscordDirectoryChannelDto[]>().notNull().default([]),
        roles: jsonb("roles").$type<DiscordDirectoryRoleDto[]>().notNull().default([]),
        members: jsonb("members").$type<DiscordDirectoryMemberDto[]>().notNull().default([]),
        ...timestamps
    },
    (table) => [check("discord_directory_singleton", sql`${table.id} = 1`)]
);

export const feedbackSurveyStatusEnum = pgEnum("feedback_survey_status", enumValues(FeedbackSurveyStatus));
export const feedbackOutcomeEnum = pgEnum("feedback_outcome", enumValues(FeedbackOutcome));

export const feedbackSettings = pgTable(
    "feedback_settings",
    {
        id: integer("id").primaryKey().default(1),
        questions: jsonb("questions").$type<FeedbackQuestionDto[]>().notNull(),
        firstAfterDays: integer("first_after_days").notNull().default(30),
        intervalDays: integer("interval_days").notNull().default(90),
        openDays: integer("open_days").notNull().default(14),
        intro: varchar("intro", { length: 1000 }).notNull().default(""),
        pingCrew: boolean("ping_crew").notNull().default(true),
        ...timestamps
    },
    (table) => [check("feedback_settings_singleton", sql`${table.id} = 1`)]
);

export const feedbackSubjects = pgTable(
    "feedback_subjects",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        supervisorDiscordId: varchar("supervisor_discord_id", { length: 20 }).notNull(),
        supervisorUsername: varchar("supervisor_username", { length: 64 }).notNull(),
        title: varchar("title", { length: 80 }).notNull(),
        channelId: varchar("channel_id", { length: 20 }),
        crewRoleIds: text("crew_role_ids")
            .array()
            .notNull()
            .default(sql`'{}'`),
        startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
        firstAfterDays: integer("first_after_days").notNull(),
        intervalDays: integer("interval_days").notNull(),
        isActive: boolean("is_active").notNull().default(true),
        endedAt: timestamp("ended_at", { withTimezone: true }),
        nextSurveyAt: timestamp("next_survey_at", { withTimezone: true }),
        sourceTicketId: uuid("source_ticket_id").references(() => tickets.id, { onDelete: "set null" }),
        ...timestamps
    },
    (table) => [
        index("feedback_subjects_due_idx").on(table.isActive, table.nextSurveyAt),
        check("feedback_subjects_days_positive", sql`${table.firstAfterDays} > 0 AND ${table.intervalDays} > 0`)
    ]
);

export const feedbackSurveys = pgTable(
    "feedback_surveys",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        subjectId: uuid("subject_id")
            .notNull()
            .references(() => feedbackSubjects.id, { onDelete: "cascade" }),
        sequence: integer("sequence").notNull(),
        status: feedbackSurveyStatusEnum("status").notNull().default(FeedbackSurveyStatus.Open),
        opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
        closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
        closedAt: timestamp("closed_at", { withTimezone: true }),
        questions: jsonb("questions").$type<FeedbackQuestionDto[]>().notNull(),
        intro: varchar("intro", { length: 1000 }).notNull().default(""),
        channelId: varchar("channel_id", { length: 20 }),
        messageId: varchar("message_id", { length: 20 }),
        outcome: feedbackOutcomeEnum("outcome"),
        outcomeMessage: text("outcome_message"),
        internalNote: text("internal_note"),
        outcomeByDiscordId: varchar("outcome_by_discord_id", { length: 20 }),
        outcomeByUsername: varchar("outcome_by_username", { length: 64 }),
        outcomeAt: timestamp("outcome_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
    },
    (table) => [
        unique("feedback_surveys_subject_sequence_unique").on(table.subjectId, table.sequence),
        uniqueIndex("feedback_surveys_one_open_per_subject")
            .on(table.subjectId)
            .where(sql`${table.status} = 'open'`),
        index("feedback_surveys_status_closes_idx").on(table.status, table.closesAt)
    ]
);

export const feedbackResponses = pgTable(
    "feedback_responses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        surveyId: uuid("survey_id")
            .notNull()
            .references(() => feedbackSurveys.id, { onDelete: "cascade" }),
        respondentHash: varchar("respondent_hash", { length: 64 }).notNull(),
        answers: jsonb("answers").$type<{ questionId: string; value: string }[]>().notNull(),
        ...timestamps
    },
    (table) => [unique("feedback_responses_survey_respondent_unique").on(table.surveyId, table.respondentHash)]
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
export type DiscordSettingsRecord = typeof discordSettings.$inferSelect;
export type DiscordModerationRecord = typeof discordModerationRecords.$inferSelect;
export type PipelineProgressRecord = typeof pipelineProgress.$inferSelect;
export type DeletedStorageObjectRecord = typeof deletedStorageObjects.$inferSelect;
export type AutomodRuleRecord = typeof automodRules.$inferSelect;
export type ScreenplayShelfRecord = typeof screenplayShelves.$inferSelect;
export type ScreenplayRecord = typeof screenplays.$inferSelect;
export type ScreenplayCollaboratorRecord = typeof screenplayCollaborators.$inferSelect;
export type ScreenplayVersionRecord = typeof screenplayVersions.$inferSelect;
export type DepartmentRecord = typeof departments.$inferSelect;
export type DepartmentDiscordMapRecord = typeof departmentDiscordMaps.$inferSelect;
export type TicketSettingsRecord = typeof ticketSettings.$inferSelect;
export type TicketCategoryRecord = typeof ticketCategories.$inferSelect;
export type TicketTypeRecord = typeof ticketTypes.$inferSelect;
export type TicketRecord = typeof tickets.$inferSelect;
export type DiscordDirectoryRecord = typeof discordDirectory.$inferSelect;
export type TicketHubRecord = typeof ticketHubs.$inferSelect;
export type TicketEventRecord = typeof ticketEvents.$inferSelect;
export type TicketMessageRecord = typeof ticketMessages.$inferSelect;
export type FeedbackSettingsRecord = typeof feedbackSettings.$inferSelect;
export type FeedbackSubjectRecord = typeof feedbackSubjects.$inferSelect;
export type FeedbackSurveyRecord = typeof feedbackSurveys.$inferSelect;
export type FeedbackResponseRecord = typeof feedbackResponses.$inferSelect;
