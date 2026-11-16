import { z } from "zod";
import { snowflakeSchema, timestampSchema, uuidSchema } from "./Http.js";

export enum TicketKind {
    Support = "support",
    Application = "application"
}

export enum TicketStatus {
    Open = "open",
    Closed = "closed"
}

export enum ApplicationStage {
    Submitted = "submitted",
    Interview = "interview",
    Accepted = "accepted",
    Rejected = "rejected"
}

export enum PositionStatus {
    Open = "open",
    Closed = "closed",
    Filled = "filled"
}

export enum TicketQuestionStyle {
    Short = "short",
    Paragraph = "paragraph"
}

export enum TicketAvailability {
    Available = "available",
    Disabled = "disabled",
    Upcoming = "upcoming",
    WindowClosed = "window_closed",
    PositionClosed = "position_closed",
    Filled = "filled"
}

export enum TicketHubStyle {
    Buttons = "buttons",
    Menu = "menu"
}

export enum TicketEventKind {
    Opened = "opened",
    StageChanged = "stage_changed",
    Closed = "closed",
    Reopened = "reopened",
    Assigned = "assigned",
    MemberAdded = "member_added",
    Note = "note",
    Reply = "reply"
}

export enum TicketMessageSource {
    Discord = "discord",
    Web = "web"
}

export enum DiscordChannelKind {
    Text = "text",
    Announcement = "announcement",
    Forum = "forum",
    Category = "category"
}

export const loggableTicketEvents: readonly TicketEventKind[] = [
    TicketEventKind.Opened,
    TicketEventKind.StageChanged,
    TicketEventKind.Closed,
    TicketEventKind.Reopened,
    TicketEventKind.Assigned,
    TicketEventKind.MemberAdded
];

export const ticketLimits = {
    categories: 20,
    typesPerCategory: 25,
    hubs: 10,
    hubCategories: 20,
    questions: 5,
    staffRoles: 25,
    name: 80,
    categoryDescription: 300,
    typeDescription: 100,
    emoji: 64,
    questionLabel: 45,
    questionPlaceholder: 100,
    answerLength: 4000,
    listingOverview: 4000,
    listingItems: 15,
    listingItem: 200,
    listingSection: 1500,
    message: 1500,
    hubTitle: 100,
    hubDescription: 2000,
    note: 1000,
    reply: 2000,
    openings: 100,
    maxOpenPerUser: 25,
    attachments: 10,
    messageContent: 4000,
    messageBatch: 100,
    search: 64
} as const;

const name = z.string().trim().min(1).max(ticketLimits.name);
const emoji = z.string().trim().min(1).max(ticketLimits.emoji).nullable();
const staffRoleIds = z.array(snowflakeSchema).max(ticketLimits.staffRoles);
const optionalText = (maximum: number): z.ZodNullable<z.ZodString> => z.string().trim().max(maximum).nullable();
const color = z.number().int().min(0).max(0xffffff).nullable();

export const ticketQuestionSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9_-]{1,32}$/u, "use lowercase letters, numbers, dashes or underscores"),
        label: z.string().trim().min(1).max(ticketLimits.questionLabel),
        placeholder: optionalText(ticketLimits.questionPlaceholder),
        style: z.enum(TicketQuestionStyle),
        required: z.boolean(),
        minLength: z.number().int().min(0).max(ticketLimits.answerLength),
        maxLength: z.number().int().min(1).max(ticketLimits.answerLength)
    })
    .refine((question) => question.minLength <= question.maxLength, {
        message: "minimum length exceeds maximum length",
        path: ["minLength"]
    })
    .meta({ id: "TicketQuestion" });

const questions = z
    .array(ticketQuestionSchema)
    .max(ticketLimits.questions)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, { message: "question ids must be unique" });

export const ticketListingSchema = z
    .object({
        overview: z.string().trim().max(ticketLimits.listingOverview),
        requirements: z.array(z.string().trim().min(1).max(ticketLimits.listingItem)).max(ticketLimits.listingItems),
        responsibilities: z.array(z.string().trim().min(1).max(ticketLimits.listingItem)).max(ticketLimits.listingItems),
        process: z.string().trim().max(ticketLimits.listingSection),
        about: z.string().trim().max(ticketLimits.listingSection)
    })
    .meta({ id: "TicketListing" });

export const ticketMessagesSchema = z
    .object({
        interview: optionalText(ticketLimits.message),
        accepted: optionalText(ticketLimits.message),
        rejected: optionalText(ticketLimits.message)
    })
    .meta({ id: "TicketMessages" });

export const ticketTypeSchema = z
    .object({
        id: uuidSchema,
        categoryId: uuidSchema,
        name: z.string(),
        description: z.string().nullable(),
        emoji: z.string().nullable(),
        kind: z.enum(TicketKind),
        position: z.number().int(),
        isEnabled: z.boolean(),
        staffRoleIds: z.array(snowflakeSchema),
        threadChannelId: snowflakeSchema.nullable(),
        mentionStaff: z.boolean(),
        questions: z.array(ticketQuestionSchema),
        positionStatus: z.enum(PositionStatus),
        openings: z.number().int().nullable(),
        filledCount: z.number().int(),
        opensAt: timestampSchema.nullable(),
        closesAt: timestampSchema.nullable(),
        listing: ticketListingSchema.nullable(),
        messages: ticketMessagesSchema,
        availability: z.enum(TicketAvailability),
        openTicketCount: z.number().int(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "TicketType" });

export const ticketCategorySchema = z
    .object({
        id: uuidSchema,
        name: z.string(),
        description: z.string().nullable(),
        emoji: z.string().nullable(),
        position: z.number().int(),
        isEnabled: z.boolean(),
        threadChannelId: snowflakeSchema.nullable(),
        notificationChannelId: snowflakeSchema.nullable(),
        logChannelId: snowflakeSchema.nullable(),
        staffRoleIds: z.array(snowflakeSchema),
        mentionStaff: z.boolean(),
        departmentId: uuidSchema.nullable(),
        types: z.array(ticketTypeSchema),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "TicketCategory" });

export const ticketHubSchema = z
    .object({
        id: uuidSchema,
        name: z.string(),
        channelId: snowflakeSchema.nullable(),
        messageId: snowflakeSchema.nullable(),
        title: z.string(),
        description: z.string(),
        color: z.number().int().nullable(),
        style: z.enum(TicketHubStyle),
        categoryIds: z.array(uuidSchema),
        isEnabled: z.boolean(),
        departmentId: uuidSchema.nullable(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "TicketHub" });

export const ticketSettingsSchema = z
    .object({
        guildId: snowflakeSchema.nullable(),
        logChannelId: snowflakeSchema.nullable(),
        logEvents: z.array(z.enum(TicketEventKind)),
        transcriptOnClose: z.boolean(),
        dmApplicants: z.boolean(),
        maxOpenPerUser: z.number().int(),
        updatedAt: timestampSchema.nullable()
    })
    .meta({ id: "TicketSettings" });

export const ticketConfigSchema = z
    .object({
        settings: ticketSettingsSchema,
        hubs: z.array(ticketHubSchema),
        categories: z.array(ticketCategorySchema)
    })
    .meta({ id: "TicketConfig" });

export const updateTicketSettingsSchema = z
    .object({
        guildId: snowflakeSchema.nullable().optional(),
        logChannelId: snowflakeSchema.nullable().optional(),
        logEvents: z
            .array(z.enum(TicketEventKind))
            .max(loggableTicketEvents.length)
            .refine((events) => events.every((event) => loggableTicketEvents.includes(event)), { message: "that event cannot be logged" })
            .optional(),
        transcriptOnClose: z.boolean().optional(),
        dmApplicants: z.boolean().optional(),
        maxOpenPerUser: z.number().int().min(1).max(ticketLimits.maxOpenPerUser).optional()
    })
    .meta({ id: "UpdateTicketSettings" });

export const createTicketHubSchema = z
    .object({
        name,
        channelId: snowflakeSchema.nullable().default(null),
        title: z.string().trim().min(1).max(ticketLimits.hubTitle),
        description: z.string().trim().max(ticketLimits.hubDescription).default(""),
        color: color.default(null),
        style: z.enum(TicketHubStyle).default(TicketHubStyle.Buttons),
        categoryIds: z.array(uuidSchema).max(ticketLimits.hubCategories).default([]),
        isEnabled: z.boolean().default(true)
    })
    .meta({ id: "CreateTicketHub" });

export const updateTicketHubSchema = z
    .object({
        name: name.optional(),
        channelId: snowflakeSchema.nullable().optional(),
        title: z.string().trim().min(1).max(ticketLimits.hubTitle).optional(),
        description: z.string().trim().max(ticketLimits.hubDescription).optional(),
        color: color.optional(),
        style: z.enum(TicketHubStyle).optional(),
        categoryIds: z.array(uuidSchema).max(ticketLimits.hubCategories).optional(),
        isEnabled: z.boolean().optional()
    })
    .meta({ id: "UpdateTicketHub" });

export const bindTicketHubSchema = z
    .object({
        messageId: snowflakeSchema.nullable()
    })
    .meta({ id: "BindTicketHub" });

export const createTicketCategorySchema = z
    .object({
        name,
        description: optionalText(ticketLimits.categoryDescription).default(null),
        emoji: emoji.default(null),
        position: z.number().int().min(0).max(1000).default(0),
        isEnabled: z.boolean().default(true),
        threadChannelId: snowflakeSchema.nullable().default(null),
        notificationChannelId: snowflakeSchema.nullable().default(null),
        logChannelId: snowflakeSchema.nullable().default(null),
        staffRoleIds: staffRoleIds.default([]),
        mentionStaff: z.boolean().default(true)
    })
    .meta({ id: "CreateTicketCategory" });

export const updateTicketCategorySchema = z
    .object({
        name: name.optional(),
        description: optionalText(ticketLimits.categoryDescription).optional(),
        emoji: emoji.optional(),
        position: z.number().int().min(0).max(1000).optional(),
        isEnabled: z.boolean().optional(),
        threadChannelId: snowflakeSchema.nullable().optional(),
        notificationChannelId: snowflakeSchema.nullable().optional(),
        logChannelId: snowflakeSchema.nullable().optional(),
        staffRoleIds: staffRoleIds.optional(),
        mentionStaff: z.boolean().optional()
    })
    .meta({ id: "UpdateTicketCategory" });

const ticketTypeFields = {
    name,
    description: optionalText(ticketLimits.typeDescription),
    emoji,
    kind: z.enum(TicketKind),
    position: z.number().int().min(0).max(1000),
    isEnabled: z.boolean(),
    staffRoleIds,
    threadChannelId: snowflakeSchema.nullable(),
    mentionStaff: z.boolean(),
    questions,
    positionStatus: z.enum(PositionStatus),
    openings: z.number().int().min(1).max(ticketLimits.openings).nullable(),
    opensAt: timestampSchema.nullable(),
    closesAt: timestampSchema.nullable(),
    listing: ticketListingSchema.nullable(),
    messages: ticketMessagesSchema
};

function windowIsOrdered(value: { opensAt?: string | null; closesAt?: string | null }): boolean {
    return (
        value.opensAt === undefined ||
        value.opensAt === null ||
        value.closesAt === undefined ||
        value.closesAt === null ||
        new Date(value.closesAt).getTime() > new Date(value.opensAt).getTime()
    );
}

const windowIssue = { message: "the application window must close after it opens", path: ["closesAt"] };

export const createTicketTypeSchema = z
    .object({
        categoryId: uuidSchema,
        name: ticketTypeFields.name,
        kind: ticketTypeFields.kind,
        description: ticketTypeFields.description.default(null),
        emoji: ticketTypeFields.emoji.default(null),
        position: ticketTypeFields.position.default(0),
        isEnabled: ticketTypeFields.isEnabled.default(true),
        staffRoleIds: ticketTypeFields.staffRoleIds.default([]),
        threadChannelId: ticketTypeFields.threadChannelId.default(null),
        mentionStaff: ticketTypeFields.mentionStaff.default(true),
        questions: ticketTypeFields.questions.default([]),
        positionStatus: ticketTypeFields.positionStatus.default(PositionStatus.Open),
        openings: ticketTypeFields.openings.default(null),
        opensAt: ticketTypeFields.opensAt.default(null),
        closesAt: ticketTypeFields.closesAt.default(null),
        listing: ticketTypeFields.listing.default(null),
        messages: ticketTypeFields.messages.default({ interview: null, accepted: null, rejected: null })
    })
    .refine(windowIsOrdered, windowIssue)
    .meta({ id: "CreateTicketType" });

export const updateTicketTypeSchema = z
    .object({
        categoryId: uuidSchema.optional(),
        name: ticketTypeFields.name.optional(),
        kind: ticketTypeFields.kind.optional(),
        description: ticketTypeFields.description.optional(),
        emoji: ticketTypeFields.emoji.optional(),
        position: ticketTypeFields.position.optional(),
        isEnabled: ticketTypeFields.isEnabled.optional(),
        staffRoleIds: ticketTypeFields.staffRoleIds.optional(),
        threadChannelId: ticketTypeFields.threadChannelId.optional(),
        mentionStaff: ticketTypeFields.mentionStaff.optional(),
        questions: ticketTypeFields.questions.optional(),
        positionStatus: ticketTypeFields.positionStatus.optional(),
        openings: ticketTypeFields.openings.optional(),
        opensAt: ticketTypeFields.opensAt.optional(),
        closesAt: ticketTypeFields.closesAt.optional(),
        listing: ticketTypeFields.listing.optional(),
        messages: ticketTypeFields.messages.optional(),
        resetFilledCount: z.boolean().optional()
    })
    .refine(windowIsOrdered, windowIssue)
    .meta({ id: "UpdateTicketType" });

export const ticketPersonSchema = z
    .object({
        discordId: snowflakeSchema,
        username: z.string().trim().min(1).max(64)
    })
    .meta({ id: "TicketPerson" });

export const ticketAnswerSchema = z
    .object({
        questionId: z.string(),
        label: z.string(),
        value: z.string()
    })
    .meta({ id: "TicketAnswer" });

export const ticketSchema = z
    .object({
        id: uuidSchema,
        number: z.number().int(),
        typeId: uuidSchema.nullable(),
        categoryId: uuidSchema.nullable(),
        typeName: z.string(),
        categoryName: z.string(),
        kind: z.enum(TicketKind),
        status: z.enum(TicketStatus),
        stage: z.enum(ApplicationStage).nullable(),
        opener: ticketPersonSchema,
        assignee: ticketPersonSchema.nullable(),
        threadId: snowflakeSchema.nullable(),
        introMessageId: snowflakeSchema.nullable(),
        notificationChannelId: snowflakeSchema.nullable(),
        notificationMessageId: snowflakeSchema.nullable(),
        answers: z.array(ticketAnswerSchema),
        decidedBy: ticketPersonSchema.nullable(),
        decidedAt: timestampSchema.nullable(),
        decisionNote: z.string().nullable(),
        closedBy: ticketPersonSchema.nullable(),
        closedAt: timestampSchema.nullable(),
        closeReason: z.string().nullable(),
        lastActivityAt: timestampSchema,
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "Ticket" });

export const ticketEventSchema = z
    .object({
        id: uuidSchema,
        ticketId: uuidSchema,
        kind: z.enum(TicketEventKind),
        actor: ticketPersonSchema.nullable(),
        stage: z.enum(ApplicationStage).nullable(),
        target: ticketPersonSchema.nullable(),
        note: z.string().nullable(),
        createdAt: timestampSchema
    })
    .meta({ id: "TicketEvent" });

export const ticketAttachmentSchema = z
    .object({
        name: z.string().max(256),
        url: z.url().max(2048),
        contentType: z.string().max(128).nullable()
    })
    .meta({ id: "TicketAttachment" });

export const ticketMessageSchema = z
    .object({
        id: uuidSchema,
        ticketId: uuidSchema,
        discordMessageId: snowflakeSchema.nullable(),
        source: z.enum(TicketMessageSource),
        author: ticketPersonSchema,
        authorAvatarUrl: z.string().nullable(),
        content: z.string(),
        attachments: z.array(ticketAttachmentSchema),
        editedAt: timestampSchema.nullable(),
        deletedAt: timestampSchema.nullable(),
        createdAt: timestampSchema
    })
    .meta({ id: "TicketMessage" });

export const ticketDetailSchema = z
    .object({
        ticket: ticketSchema,
        events: z.array(ticketEventSchema),
        messages: z.array(ticketMessageSchema),
        guildId: snowflakeSchema.nullable()
    })
    .meta({ id: "TicketDetail" });

const actor = ticketPersonSchema.optional();

export const openTicketSchema = z
    .object({
        typeId: uuidSchema,
        opener: ticketPersonSchema,
        answers: z
            .array(z.object({ questionId: z.string().max(32), value: z.string().max(ticketLimits.answerLength) }))
            .max(ticketLimits.questions)
            .default([])
    })
    .meta({ id: "OpenTicket" });

export const bindTicketSchema = z
    .object({
        threadId: snowflakeSchema.nullable().optional(),
        introMessageId: snowflakeSchema.nullable().optional(),
        notificationChannelId: snowflakeSchema.nullable().optional(),
        notificationMessageId: snowflakeSchema.nullable().optional()
    })
    .meta({ id: "BindTicket" });

export const ticketStageInputSchema = z
    .object({
        stage: z.enum([ApplicationStage.Interview, ApplicationStage.Accepted, ApplicationStage.Rejected]),
        note: optionalText(ticketLimits.note).default(null),
        actor
    })
    .meta({ id: "TicketStageInput" });

export const closeTicketSchema = z
    .object({
        reason: optionalText(ticketLimits.note).default(null),
        actor
    })
    .meta({ id: "CloseTicket" });

export const reopenTicketSchema = z
    .object({
        reason: optionalText(ticketLimits.note).default(null),
        actor
    })
    .meta({ id: "ReopenTicket" });

export const assignTicketSchema = z
    .object({
        assignee: ticketPersonSchema.nullable(),
        actor
    })
    .meta({ id: "AssignTicket" });

export const addTicketMemberSchema = z
    .object({
        member: ticketPersonSchema,
        actor
    })
    .meta({ id: "AddTicketMember" });

export const ticketNoteInputSchema = z
    .object({
        content: z.string().trim().min(1).max(ticketLimits.note),
        actor
    })
    .meta({ id: "TicketNoteInput" });

export const ticketReplyInputSchema = z
    .object({
        content: z.string().trim().min(1).max(ticketLimits.reply)
    })
    .meta({ id: "TicketReplyInput" });

export const recordTicketMessageSchema = z.object({
    discordMessageId: snowflakeSchema,
    author: ticketPersonSchema,
    authorAvatarUrl: z.url().max(512).nullable().default(null),
    content: z.string().max(ticketLimits.messageContent).default(""),
    attachments: z.array(ticketAttachmentSchema).max(ticketLimits.attachments).default([]),
    createdAt: timestampSchema,
    editedAt: timestampSchema.nullable().default(null)
});

export const recordTicketMessagesSchema = z
    .object({
        messages: z.array(recordTicketMessageSchema).max(ticketLimits.messageBatch)
    })
    .meta({ id: "RecordTicketMessages" });

export const linkTicketMessageSchema = z
    .object({
        discordMessageId: snowflakeSchema
    })
    .meta({ id: "LinkTicketMessage" });

export const ticketListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    status: z.enum(TicketStatus).optional(),
    kind: z.enum(TicketKind).optional(),
    stage: z.enum(ApplicationStage).optional(),
    categoryId: uuidSchema.optional(),
    typeId: uuidSchema.optional(),
    openerDiscordId: snowflakeSchema.optional(),
    assigneeDiscordId: snowflakeSchema.optional(),
    unassigned: z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .optional(),
    search: z.string().trim().min(1).max(ticketLimits.search).optional()
});

export const ticketSummarySchema = z
    .object({
        open: z.number().int(),
        awaitingReview: z.number().int(),
        interviewing: z.number().int(),
        unassigned: z.number().int(),
        mine: z.number().int()
    })
    .meta({ id: "TicketSummary" });

export const ticketAccessSchema = z
    .object({
        canConfigure: z.boolean(),
        isAllCategories: z.boolean(),
        categoryIds: z.array(uuidSchema)
    })
    .meta({ id: "TicketAccess" });

export const publicPositionSchema = z
    .object({
        id: uuidSchema,
        name: z.string(),
        categoryName: z.string(),
        description: z.string().nullable(),
        emoji: z.string().nullable(),
        availability: z.enum(TicketAvailability),
        openings: z.number().int().nullable(),
        filledCount: z.number().int(),
        opensAt: timestampSchema.nullable(),
        closesAt: timestampSchema.nullable(),
        listing: ticketListingSchema.nullable(),
        applyUrl: z.string().nullable()
    })
    .meta({ id: "PublicPosition" });

export const publicPositionsSchema = z
    .object({
        positions: z.array(publicPositionSchema)
    })
    .meta({ id: "PublicPositions" });

export const ensureDepartmentDeskSchema = z
    .object({
        departmentName: z.string().trim().min(1).max(ticketLimits.name),
        applyChannelId: snowflakeSchema,
        notificationChannelId: snowflakeSchema.nullable().default(null),
        staffRoleIds: z.array(snowflakeSchema).max(ticketLimits.staffRoles).default([])
    })
    .meta({ id: "EnsureDepartmentDesk" });

export const departmentDeskSchema = z
    .object({
        categoryId: uuidSchema,
        hubId: uuidSchema,
        created: z.boolean(),
        changed: z.boolean()
    })
    .meta({ id: "DepartmentDesk" });

export type EnsureDepartmentDeskDto = z.input<typeof ensureDepartmentDeskSchema>;
export type DepartmentDeskDto = z.infer<typeof departmentDeskSchema>;

export const discordDirectoryChannelSchema = z
    .object({
        id: snowflakeSchema,
        name: z.string(),
        kind: z.enum(DiscordChannelKind),
        parentId: snowflakeSchema.nullable(),
        position: z.number().int()
    })
    .meta({ id: "DiscordDirectoryChannel" });

export const discordDirectoryRoleSchema = z
    .object({
        id: snowflakeSchema,
        name: z.string(),
        color: z.number().int(),
        position: z.number().int(),
        isManaged: z.boolean()
    })
    .meta({ id: "DiscordDirectoryRole" });

export const discordDirectoryMemberSchema = z
    .object({
        id: snowflakeSchema,
        username: z.string().max(64),
        displayName: z.string().max(64),
        avatarUrl: z.string().max(512).nullable(),
        roleIds: z.array(snowflakeSchema).max(250)
    })
    .meta({ id: "DiscordDirectoryMember" });

export const discordDirectorySchema = z
    .object({
        guildId: snowflakeSchema.nullable(),
        channels: z.array(discordDirectoryChannelSchema),
        roles: z.array(discordDirectoryRoleSchema),
        members: z.array(discordDirectoryMemberSchema),
        syncedAt: timestampSchema.nullable()
    })
    .meta({ id: "DiscordDirectory" });

export const updateDiscordDirectorySchema = z
    .object({
        guildId: snowflakeSchema,
        channels: z.array(discordDirectoryChannelSchema).max(1000),
        roles: z.array(discordDirectoryRoleSchema).max(500),
        members: z.array(discordDirectoryMemberSchema).max(20_000).default([])
    })
    .meta({ id: "UpdateDiscordDirectory" });

export type TicketQuestionDto = z.infer<typeof ticketQuestionSchema>;
export type TicketListingDto = z.infer<typeof ticketListingSchema>;
export type TicketMessagesDto = z.infer<typeof ticketMessagesSchema>;
export type TicketTypeDto = z.infer<typeof ticketTypeSchema>;
export type TicketCategoryDto = z.infer<typeof ticketCategorySchema>;
export type TicketHubDto = z.infer<typeof ticketHubSchema>;
export type TicketSettingsDto = z.infer<typeof ticketSettingsSchema>;
export type TicketConfigDto = z.infer<typeof ticketConfigSchema>;
export type UpdateTicketSettingsDto = z.input<typeof updateTicketSettingsSchema>;
export type CreateTicketHubDto = z.input<typeof createTicketHubSchema>;
export type UpdateTicketHubDto = z.input<typeof updateTicketHubSchema>;
export type BindTicketHubDto = z.input<typeof bindTicketHubSchema>;
export type CreateTicketCategoryDto = z.input<typeof createTicketCategorySchema>;
export type UpdateTicketCategoryDto = z.input<typeof updateTicketCategorySchema>;
export type CreateTicketTypeDto = z.input<typeof createTicketTypeSchema>;
export type UpdateTicketTypeDto = z.input<typeof updateTicketTypeSchema>;
export type TicketPersonDto = z.infer<typeof ticketPersonSchema>;
export type TicketAnswerDto = z.infer<typeof ticketAnswerSchema>;
export type TicketDto = z.infer<typeof ticketSchema>;
export type TicketEventDto = z.infer<typeof ticketEventSchema>;
export type TicketAttachmentDto = z.infer<typeof ticketAttachmentSchema>;
export type TicketMessageDto = z.infer<typeof ticketMessageSchema>;
export type TicketDetailDto = z.infer<typeof ticketDetailSchema>;
export type OpenTicketDto = z.input<typeof openTicketSchema>;
export type BindTicketDto = z.input<typeof bindTicketSchema>;
export type TicketStageInputDto = z.input<typeof ticketStageInputSchema>;
export type CloseTicketDto = z.input<typeof closeTicketSchema>;
export type ReopenTicketDto = z.input<typeof reopenTicketSchema>;
export type AssignTicketDto = z.input<typeof assignTicketSchema>;
export type AddTicketMemberDto = z.input<typeof addTicketMemberSchema>;
export type TicketNoteInputDto = z.input<typeof ticketNoteInputSchema>;
export type TicketReplyInputDto = z.input<typeof ticketReplyInputSchema>;
export type RecordTicketMessageDto = z.input<typeof recordTicketMessageSchema>;
export type RecordTicketMessagesDto = z.input<typeof recordTicketMessagesSchema>;
export type TicketListQuery = Partial<z.infer<typeof ticketListQuerySchema>>;
export type TicketSummaryDto = z.infer<typeof ticketSummarySchema>;
export type TicketAccessDto = z.infer<typeof ticketAccessSchema>;
export type PublicPositionDto = z.infer<typeof publicPositionSchema>;
export type PublicPositionsDto = z.infer<typeof publicPositionsSchema>;
export type DiscordDirectoryChannelDto = z.infer<typeof discordDirectoryChannelSchema>;
export type DiscordDirectoryRoleDto = z.infer<typeof discordDirectoryRoleSchema>;
export type DiscordDirectoryMemberDto = z.infer<typeof discordDirectoryMemberSchema>;
export type DiscordDirectoryDto = z.infer<typeof discordDirectorySchema>;
export type UpdateDiscordDirectoryDto = z.input<typeof updateDiscordDirectorySchema>;

export interface AvailabilityInput {
    readonly kind: TicketKind;
    readonly isEnabled: boolean;
    readonly positionStatus: PositionStatus;
    readonly openings: number | null;
    readonly filledCount: number;
    readonly opensAt: string | Date | null;
    readonly closesAt: string | Date | null;
}

export function ticketAvailability(type: AvailabilityInput, now: Date = new Date()): TicketAvailability {
    if (!type.isEnabled) {
        return TicketAvailability.Disabled;
    }
    if (type.kind !== TicketKind.Application) {
        return TicketAvailability.Available;
    }
    if (type.positionStatus === PositionStatus.Filled || (type.openings !== null && type.filledCount >= type.openings)) {
        return TicketAvailability.Filled;
    }
    if (type.positionStatus === PositionStatus.Closed) {
        return TicketAvailability.PositionClosed;
    }
    if (type.opensAt !== null && new Date(type.opensAt).getTime() > now.getTime()) {
        return TicketAvailability.Upcoming;
    }
    if (type.closesAt !== null && new Date(type.closesAt).getTime() <= now.getTime()) {
        return TicketAvailability.WindowClosed;
    }
    return TicketAvailability.Available;
}

export const ticketAvailabilityLabels: Readonly<Record<TicketAvailability, string>> = {
    [TicketAvailability.Available]: "Accepting",
    [TicketAvailability.Disabled]: "Disabled",
    [TicketAvailability.Upcoming]: "Opens soon",
    [TicketAvailability.WindowClosed]: "Window closed",
    [TicketAvailability.PositionClosed]: "Closed",
    [TicketAvailability.Filled]: "Filled"
};

export const applicationStageLabels: Readonly<Record<ApplicationStage, string>> = {
    [ApplicationStage.Submitted]: "Submitted",
    [ApplicationStage.Interview]: "Interview",
    [ApplicationStage.Accepted]: "Accepted",
    [ApplicationStage.Rejected]: "Rejected"
};

export const ticketEventLabels: Readonly<Record<TicketEventKind, string>> = {
    [TicketEventKind.Opened]: "Ticket opened",
    [TicketEventKind.StageChanged]: "Stage changed",
    [TicketEventKind.Closed]: "Ticket closed",
    [TicketEventKind.Reopened]: "Ticket reopened",
    [TicketEventKind.Assigned]: "Assignment changed",
    [TicketEventKind.MemberAdded]: "Member added",
    [TicketEventKind.Note]: "Staff note",
    [TicketEventKind.Reply]: "Reply from the web"
};

export const applicationStageTransitions: Readonly<Record<ApplicationStage, readonly ApplicationStage[]>> = {
    [ApplicationStage.Submitted]: [ApplicationStage.Interview, ApplicationStage.Accepted, ApplicationStage.Rejected],
    [ApplicationStage.Interview]: [ApplicationStage.Accepted, ApplicationStage.Rejected],
    [ApplicationStage.Accepted]: [],
    [ApplicationStage.Rejected]: []
};

export function effectiveStaffRoleIds(
    category: { readonly staffRoleIds: readonly string[] },
    type: { readonly staffRoleIds: readonly string[] } | null
): string[] {
    return type !== null && type.staffRoleIds.length > 0 ? [...type.staffRoleIds] : [...category.staffRoleIds];
}

export const defaultTicketMessages = {
    interview:
        "Thanks for applying for **{position}**. We would like to invite you to an interview. A staff member will follow up in your ticket.",
    accepted: "Congratulations! You have been accepted as **{position}**. Watch your ticket for next steps.",
    rejected:
        "Thank you for applying for **{position}**. After reviewing your application we will not be moving forward with it at this time."
} as const;
