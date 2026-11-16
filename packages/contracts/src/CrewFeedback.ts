import { z } from "zod";
import { snowflakeSchema, timestampSchema, uuidSchema } from "./Http.js";

export enum FeedbackQuestionKind {
    Rating = "rating",
    Text = "text"
}

export enum FeedbackSurveyStatus {
    Open = "open",
    Closed = "closed"
}

export enum FeedbackOutcome {
    NoAction = "no_action",
    Acknowledged = "acknowledged",
    Mitigation = "mitigation"
}

export const feedbackLimits = {
    questions: 5,
    questionLabel: 45,
    answer: 1000,
    title: 80,
    intro: 1000,
    outcomeMessage: 4000,
    internalNote: 2000,
    crewRoles: 25,
    minimumDays: 1,
    maximumDays: 365,
    maximumOpenDays: 60
} as const;

export const ratingScale = [1, 2, 3, 4, 5] as const;

export const ratingLabels: Readonly<Record<number, string>> = {
    1: "Very poor",
    2: "Poor",
    3: "Okay",
    4: "Good",
    5: "Excellent"
};

const days = z.number().int().min(feedbackLimits.minimumDays).max(feedbackLimits.maximumDays);
const openDays = z.number().int().min(1).max(feedbackLimits.maximumOpenDays);
const person = z.object({ discordId: snowflakeSchema, username: z.string().trim().min(1).max(64) });

export const feedbackQuestionSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9_-]{1,32}$/u, "use lowercase letters, numbers, dashes or underscores"),
        label: z.string().trim().min(1).max(feedbackLimits.questionLabel),
        kind: z.enum(FeedbackQuestionKind),
        required: z.boolean()
    })
    .meta({ id: "FeedbackQuestion" });

const questions = z
    .array(feedbackQuestionSchema)
    .min(1)
    .max(feedbackLimits.questions)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, { message: "question ids must be unique" });

export const defaultFeedbackQuestions: readonly z.infer<typeof feedbackQuestionSchema>[] = [
    { id: "overall", label: "Overall, how is your supervisor doing?", kind: FeedbackQuestionKind.Rating, required: true },
    { id: "direction", label: "How clear is their direction and feedback?", kind: FeedbackQuestionKind.Rating, required: true },
    { id: "approachable", label: "How approachable are they?", kind: FeedbackQuestionKind.Rating, required: true },
    { id: "going_well", label: "What is going well?", kind: FeedbackQuestionKind.Text, required: false },
    { id: "remarks", label: "Anything else leadership should know?", kind: FeedbackQuestionKind.Text, required: false }
];

export const defaultAcknowledgement =
    "Thanks for the work you have been putting in. Your crew's latest check-in came back positive, so keep it up!";

export const feedbackSettingsSchema = z
    .object({
        questions: z.array(feedbackQuestionSchema),
        firstAfterDays: z.number().int(),
        intervalDays: z.number().int(),
        openDays: z.number().int(),
        intro: z.string(),
        pingCrew: z.boolean(),
        updatedAt: timestampSchema.nullable()
    })
    .meta({ id: "FeedbackSettings" });

export const updateFeedbackSettingsSchema = z
    .object({
        questions: questions.optional(),
        firstAfterDays: days.optional(),
        intervalDays: days.optional(),
        openDays: openDays.optional(),
        intro: z.string().trim().max(feedbackLimits.intro).optional(),
        pingCrew: z.boolean().optional()
    })
    .meta({ id: "UpdateFeedbackSettings" });

export const feedbackSubjectSchema = z
    .object({
        id: uuidSchema,
        supervisor: person,
        title: z.string(),
        channelId: snowflakeSchema.nullable(),
        crewRoleIds: z.array(snowflakeSchema),
        startedAt: timestampSchema,
        firstAfterDays: z.number().int(),
        intervalDays: z.number().int(),
        isActive: z.boolean(),
        endedAt: timestampSchema.nullable(),
        nextSurveyAt: timestampSchema.nullable(),
        sourceTicketId: uuidSchema.nullable(),
        surveyCount: z.number().int(),
        openSurveyId: uuidSchema.nullable(),
        createdAt: timestampSchema,
        updatedAt: timestampSchema
    })
    .meta({ id: "FeedbackSubject" });

export const createFeedbackSubjectSchema = z
    .object({
        supervisor: person,
        title: z.string().trim().min(1).max(feedbackLimits.title),
        channelId: snowflakeSchema.nullable().default(null),
        crewRoleIds: z.array(snowflakeSchema).max(feedbackLimits.crewRoles).default([]),
        startedAt: timestampSchema.optional(),
        firstAfterDays: days.optional(),
        intervalDays: days.optional(),
        sourceTicketId: uuidSchema.nullable().default(null)
    })
    .meta({ id: "CreateFeedbackSubject" });

export const updateFeedbackSubjectSchema = z
    .object({
        title: z.string().trim().min(1).max(feedbackLimits.title).optional(),
        channelId: snowflakeSchema.nullable().optional(),
        crewRoleIds: z.array(snowflakeSchema).max(feedbackLimits.crewRoles).optional(),
        startedAt: timestampSchema.optional(),
        firstAfterDays: days.optional(),
        intervalDays: days.optional(),
        isActive: z.boolean().optional()
    })
    .meta({ id: "UpdateFeedbackSubject" });

export const feedbackSurveySchema = z
    .object({
        id: uuidSchema,
        subjectId: uuidSchema,
        sequence: z.number().int(),
        title: z.string(),
        supervisor: person,
        crewRoleIds: z.array(snowflakeSchema),
        status: z.enum(FeedbackSurveyStatus),
        opensAt: timestampSchema,
        closesAt: timestampSchema,
        closedAt: timestampSchema.nullable(),
        questions: z.array(feedbackQuestionSchema),
        intro: z.string(),
        channelId: snowflakeSchema.nullable(),
        messageId: snowflakeSchema.nullable(),
        responseCount: z.number().int(),
        outcome: z.enum(FeedbackOutcome).nullable(),
        outcomeMessage: z.string().nullable(),
        outcomeBy: person.nullable(),
        outcomeAt: timestampSchema.nullable(),
        createdAt: timestampSchema
    })
    .meta({ id: "FeedbackSurvey" });

export const feedbackSurveyDetailSchema = feedbackSurveySchema
    .extend({
        internalNote: z.string().nullable(),
        ratings: z.array(
            z.object({
                questionId: z.string(),
                label: z.string(),
                count: z.number().int(),
                average: z.number().nullable(),
                distribution: z.array(z.number().int())
            })
        ),
        comments: z.array(z.object({ questionId: z.string(), label: z.string(), answers: z.array(z.string()) }))
    })
    .meta({ id: "FeedbackSurveyDetail" });

export const feedbackResponseInputSchema = z
    .object({
        respondent: person,
        answers: z
            .array(z.object({ questionId: z.string().max(32), value: z.string().max(feedbackLimits.answer) }))
            .max(feedbackLimits.questions)
    })
    .meta({ id: "FeedbackResponseInput" });

export const recordFeedbackOutcomeSchema = z
    .object({
        outcome: z.enum(FeedbackOutcome),
        message: z.string().trim().max(feedbackLimits.outcomeMessage).nullable().default(null),
        internalNote: z.string().trim().max(feedbackLimits.internalNote).nullable().default(null)
    })
    .refine((value) => value.outcome !== FeedbackOutcome.Mitigation || (value.message !== null && value.message.length > 0), {
        message: "a mitigation needs the action steps to send",
        path: ["message"]
    })
    .meta({ id: "RecordFeedbackOutcome" });

export const bindFeedbackSurveySchema = z
    .object({
        messageId: snowflakeSchema.nullable()
    })
    .meta({ id: "BindFeedbackSurvey" });

export type FeedbackQuestionDto = z.infer<typeof feedbackQuestionSchema>;
export type FeedbackSettingsDto = z.infer<typeof feedbackSettingsSchema>;
export type UpdateFeedbackSettingsDto = z.input<typeof updateFeedbackSettingsSchema>;
export type FeedbackSubjectDto = z.infer<typeof feedbackSubjectSchema>;
export type CreateFeedbackSubjectDto = z.input<typeof createFeedbackSubjectSchema>;
export type UpdateFeedbackSubjectDto = z.input<typeof updateFeedbackSubjectSchema>;
export type FeedbackSurveyDto = z.infer<typeof feedbackSurveySchema>;
export type FeedbackSurveyDetailDto = z.infer<typeof feedbackSurveyDetailSchema>;
export type FeedbackResponseInputDto = z.input<typeof feedbackResponseInputSchema>;
export type RecordFeedbackOutcomeDto = z.input<typeof recordFeedbackOutcomeSchema>;

export const feedbackOutcomeLabels: Readonly<Record<FeedbackOutcome, string>> = {
    [FeedbackOutcome.NoAction]: "No action",
    [FeedbackOutcome.Acknowledged]: "Acknowledged",
    [FeedbackOutcome.Mitigation]: "Mitigation"
};
