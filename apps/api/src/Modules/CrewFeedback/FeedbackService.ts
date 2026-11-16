import {
    defaultFeedbackQuestions,
    FeedbackOutcome,
    FeedbackQuestionKind,
    FeedbackSurveyStatus,
    NotificationType,
    ratingScale,
    type createFeedbackSubjectSchema,
    type FeedbackQuestionDto,
    type feedbackResponseInputSchema,
    type recordFeedbackOutcomeSchema,
    type updateFeedbackSettingsSchema,
    type updateFeedbackSubjectSchema
} from "@platform/contracts";
import { and, asc, count, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { z } from "zod";
import { BadRequestError, ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { hmacHex } from "../../Common/Security/Secrets.js";
import { isUniqueViolation, type Database } from "../../Infrastructure/Database/Database.js";
import {
    feedbackResponses,
    feedbackSettings,
    feedbackSubjects,
    feedbackSurveys,
    type FeedbackSettingsRecord,
    type FeedbackSubjectRecord,
    type FeedbackSurveyRecord
} from "../../Infrastructure/Database/Schema.js";
import type { Notifier } from "../../Infrastructure/Notifications/Notification.js";

export type UpdateSettingsInput = z.output<typeof updateFeedbackSettingsSchema>;
export type CreateSubjectInput = z.output<typeof createFeedbackSubjectSchema>;
export type UpdateSubjectInput = z.output<typeof updateFeedbackSubjectSchema>;
export type ResponseInput = z.output<typeof feedbackResponseInputSchema>;
export type OutcomeInput = z.output<typeof recordFeedbackOutcomeSchema>;

export interface Person {
    readonly discordId: string;
    readonly username: string;
}

export interface SubjectView {
    readonly record: FeedbackSubjectRecord;
    readonly surveyCount: number;
    readonly openSurveyId: string | null;
}

export interface SurveyView {
    readonly record: FeedbackSurveyRecord;
    readonly subject: FeedbackSubjectRecord;
    readonly responseCount: number;
}

export interface RatingSummary {
    readonly questionId: string;
    readonly label: string;
    readonly count: number;
    readonly average: number | null;
    readonly distribution: number[];
}

export interface CommentSummary {
    readonly questionId: string;
    readonly label: string;
    readonly answers: string[];
}

export interface SurveyResults extends SurveyView {
    readonly ratings: RatingSummary[];
    readonly comments: CommentSummary[];
}

const dayMs = 24 * 60 * 60 * 1000;

export const defaultSettings = {
    questions: [...defaultFeedbackQuestions],
    firstAfterDays: 30,
    intervalDays: 90,
    openDays: 14,
    intro: "",
    pingCrew: true
};

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * dayMs);
}

function shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
    }
    return copy;
}

function definedEntries<T extends object>(input: T): Partial<T> {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export class FeedbackService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly appKey: string
    ) {}

    public async settings(): Promise<FeedbackSettingsRecord | null> {
        const [record] = await this.database.select().from(feedbackSettings).where(eq(feedbackSettings.id, 1)).limit(1);
        return record ?? null;
    }

    public async effectiveSettings(): Promise<typeof defaultSettings & { updatedAt: Date | null }> {
        const record = await this.settings();
        return record === null ? { ...defaultSettings, updatedAt: null } : { ...record };
    }

    public async updateSettings(input: UpdateSettingsInput): Promise<FeedbackSettingsRecord> {
        const values = definedEntries(input);
        const [saved] = await this.database
            .insert(feedbackSettings)
            .values({ ...defaultSettings, ...values, id: 1 })
            .onConflictDoUpdate({ target: feedbackSettings.id, set: { ...values, updatedAt: new Date() } })
            .returning();
        if (saved === undefined) {
            throw new Error("Feedback settings upsert returned no row.");
        }
        return saved;
    }

    public async subjects(): Promise<SubjectView[]> {
        const [subjects, surveyCounts, open] = await Promise.all([
            this.database.select().from(feedbackSubjects).orderBy(desc(feedbackSubjects.isActive), asc(feedbackSubjects.nextSurveyAt)),
            this.database
                .select({ subjectId: feedbackSurveys.subjectId, total: count() })
                .from(feedbackSurveys)
                .groupBy(feedbackSurveys.subjectId),
            this.database
                .select({ subjectId: feedbackSurveys.subjectId, id: feedbackSurveys.id })
                .from(feedbackSurveys)
                .where(eq(feedbackSurveys.status, FeedbackSurveyStatus.Open))
        ]);
        const counts = new Map(surveyCounts.map((row) => [row.subjectId, row.total]));
        const openBySubject = new Map(open.map((row) => [row.subjectId, row.id]));
        return subjects.map((record) => ({
            record,
            surveyCount: counts.get(record.id) ?? 0,
            openSurveyId: openBySubject.get(record.id) ?? null
        }));
    }

    public async subject(id: string): Promise<SubjectView> {
        const view = (await this.subjects()).find((candidate) => candidate.record.id === id);
        if (view === undefined) {
            throw new NotFoundError("Feedback subject");
        }
        return view;
    }

    public async createSubject(input: CreateSubjectInput): Promise<SubjectView> {
        const settings = await this.effectiveSettings();
        const startedAt = input.startedAt === undefined ? new Date() : new Date(input.startedAt);
        const firstAfterDays = input.firstAfterDays ?? settings.firstAfterDays;
        const [saved] = await this.database
            .insert(feedbackSubjects)
            .values({
                supervisorDiscordId: input.supervisor.discordId,
                supervisorUsername: input.supervisor.username,
                title: input.title,
                channelId: input.channelId,
                crewRoleIds: input.crewRoleIds,
                startedAt,
                firstAfterDays,
                intervalDays: input.intervalDays ?? settings.intervalDays,
                nextSurveyAt: addDays(startedAt, firstAfterDays),
                sourceTicketId: input.sourceTicketId
            })
            .returning();
        if (saved === undefined) {
            throw new Error("Feedback subject insert returned no row.");
        }
        return this.subject(saved.id);
    }

    public async updateSubject(id: string, input: UpdateSubjectInput, now: Date = new Date()): Promise<SubjectView> {
        const current = (await this.subject(id)).record;
        const values: Partial<typeof feedbackSubjects.$inferInsert> = definedEntries({ ...input, startedAt: undefined });
        const startedAt = input.startedAt === undefined ? current.startedAt : new Date(input.startedAt);
        if (input.startedAt !== undefined) {
            values.startedAt = startedAt;
        }
        const isActive = input.isActive ?? current.isActive;
        if (input.isActive === false && current.isActive) {
            values.endedAt = now;
        }
        if (input.isActive === true && !current.isActive) {
            values.endedAt = null;
        }
        values.nextSurveyAt = isActive
            ? await this.nextSurveyAt(
                  id,
                  startedAt,
                  input.firstAfterDays ?? current.firstAfterDays,
                  input.intervalDays ?? current.intervalDays
              )
            : null;
        await this.database
            .update(feedbackSubjects)
            .set({ ...values, updatedAt: now })
            .where(eq(feedbackSubjects.id, id));
        if (!isActive) {
            const open = await this.openSurveyFor(id);
            if (open !== null) {
                await this.close(open.id, now);
            }
        }
        return this.subject(id);
    }

    public async deleteSubject(id: string): Promise<void> {
        const open = await this.openSurveyFor(id);
        if (open !== null) {
            await this.close(open.id);
        }
        const deleted = await this.database
            .delete(feedbackSubjects)
            .where(eq(feedbackSubjects.id, id))
            .returning({ id: feedbackSubjects.id });
        if (deleted.length === 0) {
            throw new NotFoundError("Feedback subject");
        }
    }

    public async surveys(subjectId: string): Promise<SurveyView[]> {
        const subject = (await this.subject(subjectId)).record;
        const surveys = await this.database
            .select()
            .from(feedbackSurveys)
            .where(eq(feedbackSurveys.subjectId, subjectId))
            .orderBy(desc(feedbackSurveys.sequence));
        const counts = await this.responseCounts();
        return surveys.map((record) => ({ record, subject, responseCount: counts.get(record.id) ?? 0 }));
    }

    public async openSurveys(): Promise<SurveyView[]> {
        const rows = await this.database
            .select({ survey: feedbackSurveys, subject: feedbackSubjects })
            .from(feedbackSurveys)
            .innerJoin(feedbackSubjects, eq(feedbackSubjects.id, feedbackSurveys.subjectId))
            .where(eq(feedbackSurveys.status, FeedbackSurveyStatus.Open));
        const counts = await this.responseCounts();
        return rows.map((row) => ({ record: row.survey, subject: row.subject, responseCount: counts.get(row.survey.id) ?? 0 }));
    }

    public async survey(id: string): Promise<SurveyView> {
        const [row] = await this.database
            .select({ survey: feedbackSurveys, subject: feedbackSubjects })
            .from(feedbackSurveys)
            .innerJoin(feedbackSubjects, eq(feedbackSubjects.id, feedbackSurveys.subjectId))
            .where(eq(feedbackSurveys.id, id))
            .limit(1);
        if (row === undefined) {
            throw new NotFoundError("Feedback survey");
        }
        const [responses] = await this.database
            .select({ total: count() })
            .from(feedbackResponses)
            .where(eq(feedbackResponses.surveyId, id));
        return { record: row.survey, subject: row.subject, responseCount: responses?.total ?? 0 };
    }

    public async results(id: string): Promise<SurveyResults> {
        const view = await this.survey(id);
        const responses = await this.database.select().from(feedbackResponses).where(eq(feedbackResponses.surveyId, id));
        const answersFor = (questionId: string): string[] =>
            responses.flatMap((response) =>
                response.answers.filter((answer) => answer.questionId === questionId).map((answer) => answer.value)
            );
        const ratings = view.record.questions
            .filter((question) => question.kind === FeedbackQuestionKind.Rating)
            .map((question): RatingSummary => {
                const values = answersFor(question.id)
                    .map(Number)
                    .filter((value) => ratingScale.includes(value as (typeof ratingScale)[number]));
                const total = values.reduce((sum, value) => sum + value, 0);
                return {
                    questionId: question.id,
                    label: question.label,
                    count: values.length,
                    average: values.length === 0 ? null : Math.round((total / values.length) * 100) / 100,
                    distribution: ratingScale.map((score) => values.filter((value) => value === score).length)
                };
            });
        const comments = view.record.questions
            .filter((question) => question.kind === FeedbackQuestionKind.Text)
            .map((question) => ({ questionId: question.id, label: question.label, answers: shuffled(answersFor(question.id)) }));
        return { ...view, ratings, comments };
    }

    public async openNow(subjectId: string, now: Date = new Date()): Promise<SurveyView> {
        const subject = (await this.subject(subjectId)).record;
        if (!subject.isActive) {
            throw new ConflictError("This supervisor's reviews have ended.");
        }
        if (subject.channelId === null) {
            throw new ConflictError("Set the department channel before sending a check-in.");
        }
        return this.open(subject, now);
    }

    public async openDue(now: Date = new Date()): Promise<number> {
        const due = await this.database
            .select()
            .from(feedbackSubjects)
            .where(
                and(
                    eq(feedbackSubjects.isActive, true),
                    isNotNull(feedbackSubjects.channelId),
                    isNotNull(feedbackSubjects.nextSurveyAt),
                    lte(feedbackSubjects.nextSurveyAt, now)
                )
            );
        let opened = 0;
        for (const subject of due) {
            if ((await this.openSurveyFor(subject.id)) !== null) {
                continue;
            }
            await this.open(subject, now);
            opened++;
        }
        return opened;
    }

    public async closeExpired(now: Date = new Date()): Promise<number> {
        const expired = await this.database
            .select({ id: feedbackSurveys.id })
            .from(feedbackSurveys)
            .where(and(eq(feedbackSurveys.status, FeedbackSurveyStatus.Open), lte(feedbackSurveys.closesAt, now)));
        for (const survey of expired) {
            await this.close(survey.id, now);
        }
        return expired.length;
    }

    public async closeNow(id: string, now: Date = new Date()): Promise<SurveyView> {
        const view = await this.survey(id);
        if (view.record.status !== FeedbackSurveyStatus.Open) {
            throw new ConflictError("This check-in is already closed.");
        }
        await this.close(id, now);
        return this.survey(id);
    }

    public async respond(id: string, input: ResponseInput, now: Date = new Date()): Promise<{ updated: boolean }> {
        const view = await this.survey(id);
        if (view.record.status !== FeedbackSurveyStatus.Open || view.record.closesAt.getTime() <= now.getTime()) {
            throw new ConflictError("This check-in has closed.");
        }
        if (input.respondent.discordId === view.subject.supervisorDiscordId) {
            throw new ForbiddenError("Supervisors cannot answer their own check-in.");
        }
        const answers = this.cleanAnswers(view.record.questions, input.answers);
        const respondentHash = hmacHex(this.appKey, `feedback:${id}:${input.respondent.discordId}`);
        const [existing] = await this.database
            .select({ id: feedbackResponses.id })
            .from(feedbackResponses)
            .where(and(eq(feedbackResponses.surveyId, id), eq(feedbackResponses.respondentHash, respondentHash)))
            .limit(1);
        await this.database
            .insert(feedbackResponses)
            .values({ surveyId: id, respondentHash, answers })
            .onConflictDoUpdate({
                target: [feedbackResponses.surveyId, feedbackResponses.respondentHash],
                set: { answers, updatedAt: now }
            });
        return { updated: existing !== undefined };
    }

    public async recordOutcome(id: string, input: OutcomeInput, actor: Person, now: Date = new Date()): Promise<SurveyView> {
        const view = await this.survey(id);
        if (view.record.status !== FeedbackSurveyStatus.Closed) {
            throw new ConflictError("Close the check-in before recording an outcome.");
        }
        if (view.record.outcome !== null) {
            throw new ConflictError("An outcome was already recorded for this check-in.");
        }
        const message = input.outcome === FeedbackOutcome.NoAction ? null : input.message;
        await this.database
            .update(feedbackSurveys)
            .set({
                outcome: input.outcome,
                outcomeMessage: message,
                internalNote: input.internalNote,
                outcomeByDiscordId: actor.discordId,
                outcomeByUsername: actor.username,
                outcomeAt: now
            })
            .where(eq(feedbackSurveys.id, id));
        if (message !== null && message.length > 0) {
            this.notifier.notify({ type: NotificationType.FeedbackOutcomeRecorded, surveyId: id });
        }
        return this.survey(id);
    }

    public async bindMessage(id: string, messageId: string | null): Promise<void> {
        const updated = await this.database
            .update(feedbackSurveys)
            .set({ messageId })
            .where(eq(feedbackSurveys.id, id))
            .returning({ id: feedbackSurveys.id });
        if (updated.length === 0) {
            throw new NotFoundError("Feedback survey");
        }
    }

    private cleanAnswers(
        questions: readonly FeedbackQuestionDto[],
        answers: ResponseInput["answers"]
    ): { questionId: string; value: string }[] {
        const byId = new Map(answers.map((answer) => [answer.questionId, answer.value.trim()]));
        const unknown = answers.find((answer) => !questions.some((question) => question.id === answer.questionId));
        if (unknown !== undefined) {
            throw new BadRequestError(`Unknown question "${unknown.questionId}".`, ErrorCode.ValidationFailed);
        }
        return questions.flatMap((question) => {
            const value = byId.get(question.id) ?? "";
            if (value.length === 0) {
                if (question.required) {
                    throw new BadRequestError(`"${question.label}" needs an answer.`, ErrorCode.ValidationFailed);
                }
                return [];
            }
            if (question.kind === FeedbackQuestionKind.Rating && !ratingScale.includes(Number(value) as (typeof ratingScale)[number])) {
                throw new BadRequestError(`"${question.label}" must be a rating from 1 to 5.`, ErrorCode.ValidationFailed);
            }
            return [{ questionId: question.id, value }];
        });
    }

    private async open(subject: FeedbackSubjectRecord, now: Date): Promise<SurveyView> {
        const settings = await this.effectiveSettings();
        const [latest] = await this.database
            .select({ sequence: sql<number>`coalesce(max(${feedbackSurveys.sequence}), 0)`.mapWith(Number) })
            .from(feedbackSurveys)
            .where(eq(feedbackSurveys.subjectId, subject.id));
        let survey: FeedbackSurveyRecord | undefined;
        try {
            [survey] = await this.database
                .insert(feedbackSurveys)
                .values({
                    subjectId: subject.id,
                    sequence: (latest?.sequence ?? 0) + 1,
                    opensAt: now,
                    closesAt: addDays(now, settings.openDays),
                    questions: settings.questions,
                    intro: settings.intro,
                    channelId: subject.channelId
                })
                .returning();
        } catch (error: unknown) {
            if (isUniqueViolation(error)) {
                throw new ConflictError("A check-in is already open for this supervisor.");
            }
            throw error;
        }
        if (survey === undefined) {
            throw new Error("Feedback survey insert returned no row.");
        }
        await this.database
            .update(feedbackSubjects)
            .set({ nextSurveyAt: addDays(now, subject.intervalDays), updatedAt: now })
            .where(eq(feedbackSubjects.id, subject.id));
        this.notifier.notify({ type: NotificationType.FeedbackSurveyOpened, surveyId: survey.id });
        return this.survey(survey.id);
    }

    private async close(id: string, now: Date = new Date()): Promise<void> {
        const closed = await this.database
            .update(feedbackSurveys)
            .set({ status: FeedbackSurveyStatus.Closed, closedAt: now })
            .where(and(eq(feedbackSurveys.id, id), eq(feedbackSurveys.status, FeedbackSurveyStatus.Open)))
            .returning({ id: feedbackSurveys.id });
        if (closed.length > 0) {
            this.notifier.notify({ type: NotificationType.FeedbackSurveyClosed, surveyId: id });
        }
    }

    private async openSurveyFor(subjectId: string): Promise<FeedbackSurveyRecord | null> {
        const [open] = await this.database
            .select()
            .from(feedbackSurveys)
            .where(and(eq(feedbackSurveys.subjectId, subjectId), eq(feedbackSurveys.status, FeedbackSurveyStatus.Open)))
            .limit(1);
        return open ?? null;
    }

    private async nextSurveyAt(subjectId: string, startedAt: Date, firstAfterDays: number, intervalDays: number): Promise<Date> {
        const [latest] = await this.database
            .select({ opensAt: feedbackSurveys.opensAt })
            .from(feedbackSurveys)
            .where(eq(feedbackSurveys.subjectId, subjectId))
            .orderBy(desc(feedbackSurveys.opensAt))
            .limit(1);
        return latest === undefined ? addDays(startedAt, firstAfterDays) : addDays(latest.opensAt, intervalDays);
    }

    private async responseCounts(): Promise<Map<string, number>> {
        const rows = await this.database
            .select({ surveyId: feedbackResponses.surveyId, total: count() })
            .from(feedbackResponses)
            .groupBy(feedbackResponses.surveyId);
        return new Map(rows.map((row) => [row.surveyId, row.total]));
    }
}
