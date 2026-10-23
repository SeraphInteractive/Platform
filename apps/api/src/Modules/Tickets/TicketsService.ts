import {
    ApplicationStage,
    applicationStageTransitions,
    effectiveStaffRoleIds,
    NotificationType,
    PositionStatus,
    TicketAvailability,
    TicketEventKind,
    TicketKind,
    TicketMessageSource,
    TicketStatus,
    type addTicketMemberSchema,
    type assignTicketSchema,
    type closeTicketSchema,
    type NotificationPerson,
    type openTicketSchema,
    type recordTicketMessageSchema,
    type reopenTicketSchema,
    type TicketAnswerDto,
    type TicketPersonDto,
    type TicketQuestionDto,
    type ticketListQuerySchema,
    type ticketStageInputSchema,
    type BindTicketDto
} from "@platform/contracts";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { BadRequestError, ConflictError, ErrorCode, ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page } from "../../Common/Http/Schemas.js";
import { isUniqueViolation, type Database } from "../../Infrastructure/Database/Database.js";
import {
    ticketCategories,
    ticketEvents,
    ticketMessages,
    tickets,
    ticketTypes,
    type TicketEventRecord,
    type TicketMessageRecord,
    type TicketRecord
} from "../../Infrastructure/Database/Schema.js";
import type { Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { TicketConfigService } from "./TicketConfigService.js";

export type OpenTicketInput = z.output<typeof openTicketSchema>;
export type StageInput = Omit<z.output<typeof ticketStageInputSchema>, "actor">;
export type CloseInput = Omit<z.output<typeof closeTicketSchema>, "actor">;
export type ReopenInput = Omit<z.output<typeof reopenTicketSchema>, "actor">;
export type AssignInput = Omit<z.output<typeof assignTicketSchema>, "actor">;
export type AddMemberInput = Omit<z.output<typeof addTicketMemberSchema>, "actor">;
export type RecordMessageInput = z.output<typeof recordTicketMessageSchema>;
export type TicketQuery = z.output<typeof ticketListQuerySchema>;

export interface TicketScope {
    readonly isAll: boolean;
    readonly categoryIds: readonly string[];
    readonly typeIds: readonly string[];
}

export interface TicketSummary {
    readonly open: number;
    readonly awaitingReview: number;
    readonly interviewing: number;
    readonly unassigned: number;
    readonly mine: number;
}

export interface TicketDetail {
    readonly ticket: TicketRecord;
    readonly events: readonly TicketEventRecord[];
    readonly messages: readonly TicketMessageRecord[];
}

export const everything: TicketScope = { isAll: true, categoryIds: [], typeIds: [] };

const availabilityMessages: Readonly<Record<TicketAvailability, string>> = {
    [TicketAvailability.Available]: "",
    [TicketAvailability.Disabled]: "This ticket type is not taking requests right now.",
    [TicketAvailability.Upcoming]: "Applications for this position have not opened yet.",
    [TicketAvailability.WindowClosed]: "The application window for this position has closed.",
    [TicketAvailability.PositionClosed]: "This position is not accepting applications.",
    [TicketAvailability.Filled]: "This position has been filled."
};

function cleanAnswers(questions: readonly TicketQuestionDto[], answers: OpenTicketInput["answers"]): TicketAnswerDto[] {
    const known = new Set(questions.map((question) => question.id));
    const unknown = answers.find((answer) => !known.has(answer.questionId));
    if (unknown !== undefined) {
        throw new BadRequestError(`Unknown question "${unknown.questionId}".`, ErrorCode.ValidationFailed);
    }
    const byId = new Map(answers.map((answer) => [answer.questionId, answer.value.trim()]));
    const cleaned: TicketAnswerDto[] = [];
    for (const question of questions) {
        const value = byId.get(question.id) ?? "";
        if (value.length === 0) {
            if (question.required) {
                throw new BadRequestError(`"${question.label}" needs an answer.`, ErrorCode.ValidationFailed);
            }
            continue;
        }
        if (value.length < question.minLength || value.length > question.maxLength) {
            throw new BadRequestError(
                `"${question.label}" must be ${question.minLength} to ${question.maxLength} characters.`,
                ErrorCode.ValidationFailed
            );
        }
        cleaned.push({ questionId: question.id, label: question.label, value });
    }
    return cleaned;
}

function scopeCondition(scope: TicketScope): SQL | undefined {
    if (scope.isAll) {
        return undefined;
    }
    const byType = scope.typeIds.length === 0 ? undefined : inArray(tickets.typeId, [...scope.typeIds]);
    const byCategory =
        scope.categoryIds.length === 0 ? undefined : and(isNull(tickets.typeId), inArray(tickets.categoryId, [...scope.categoryIds]));
    return or(byType, byCategory) ?? sql`false`;
}

function inScope(scope: TicketScope, ticket: TicketRecord): boolean {
    if (scope.isAll) {
        return true;
    }
    if (ticket.typeId !== null) {
        return scope.typeIds.includes(ticket.typeId);
    }
    return ticket.categoryId !== null && scope.categoryIds.includes(ticket.categoryId);
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

export class TicketsService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier,
        private readonly config: TicketConfigService
    ) {}

    public async scopeFor(roleIds: readonly string[]): Promise<TicketScope> {
        const { categories } = await this.config.config();
        const holds = (allowed: readonly string[]): boolean => allowed.some((roleId) => roleIds.includes(roleId));
        return {
            isAll: false,
            categoryIds: categories
                .filter((category) => holds(effectiveStaffRoleIds(category.record, null)))
                .map((category) => category.record.id),
            typeIds: categories.flatMap((category) =>
                category.types.filter((type) => holds(effectiveStaffRoleIds(category.record, type.record))).map((type) => type.record.id)
            )
        };
    }

    public async list(query: TicketQuery, scope: TicketScope): Promise<Page<TicketRecord>> {
        const conditions: (SQL | undefined)[] = [scopeCondition(scope)];
        if (query.status !== undefined) {
            conditions.push(eq(tickets.status, query.status));
        }
        if (query.kind !== undefined) {
            conditions.push(eq(tickets.kind, query.kind));
        }
        if (query.stage !== undefined) {
            conditions.push(eq(tickets.stage, query.stage));
        }
        if (query.categoryId !== undefined) {
            conditions.push(eq(tickets.categoryId, query.categoryId));
        }
        if (query.typeId !== undefined) {
            conditions.push(eq(tickets.typeId, query.typeId));
        }
        if (query.openerDiscordId !== undefined) {
            conditions.push(eq(tickets.openerDiscordId, query.openerDiscordId));
        }
        if (query.assigneeDiscordId !== undefined) {
            conditions.push(eq(tickets.assigneeDiscordId, query.assigneeDiscordId));
        }
        if (query.unassigned === true) {
            conditions.push(isNull(tickets.assigneeDiscordId));
        }
        if (query.search !== undefined) {
            const term = query.search.replace(/^#/u, "");
            const pattern = `%${escapeLike(term)}%`;
            const byNumber = /^\d{1,9}$/u.test(term) ? eq(tickets.number, Number(term)) : undefined;
            conditions.push(or(byNumber, ilike(tickets.openerUsername, pattern), ilike(tickets.typeName, pattern)));
        }
        const where = and(...conditions);
        const [rows, [total]] = await Promise.all([
            this.database
                .select()
                .from(tickets)
                .where(where)
                .orderBy(desc(tickets.lastActivityAt))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(tickets).where(where)
        ]);
        return createPage(rows, total?.total ?? 0, query);
    }

    public async summary(scope: TicketScope, discordId: string | null): Promise<TicketSummary> {
        const base = and(scopeCondition(scope), eq(tickets.status, TicketStatus.Open));
        const total = async (condition: SQL | undefined): Promise<number> => {
            const [row] = await this.database.select({ total: count() }).from(tickets).where(and(base, condition));
            return row?.total ?? 0;
        };
        const [open, awaitingReview, interviewing, unassigned, mine] = await Promise.all([
            total(undefined),
            total(eq(tickets.stage, ApplicationStage.Submitted)),
            total(eq(tickets.stage, ApplicationStage.Interview)),
            total(isNull(tickets.assigneeDiscordId)),
            discordId === null ? Promise.resolve(0) : total(eq(tickets.assigneeDiscordId, discordId))
        ]);
        return { open, awaitingReview, interviewing, unassigned, mine };
    }

    public async get(id: string, scope: TicketScope = everything): Promise<TicketRecord> {
        const [record] = await this.database.select().from(tickets).where(eq(tickets.id, id)).limit(1);
        if (record === undefined || !inScope(scope, record)) {
            throw new NotFoundError("Ticket");
        }
        return record;
    }

    public async getByThread(threadId: string): Promise<TicketRecord> {
        const [record] = await this.database.select().from(tickets).where(eq(tickets.threadId, threadId)).limit(1);
        if (record === undefined) {
            throw new NotFoundError("Ticket");
        }
        return record;
    }

    public async detail(id: string, scope: TicketScope): Promise<TicketDetail> {
        const ticket = await this.get(id, scope);
        const [events, messages] = await Promise.all([
            this.database.select().from(ticketEvents).where(eq(ticketEvents.ticketId, id)).orderBy(asc(ticketEvents.createdAt)),
            this.database.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id)).orderBy(asc(ticketMessages.createdAt))
        ]);
        return { ticket, events, messages };
    }

    public async open(input: OpenTicketInput, now: Date = new Date()): Promise<TicketRecord> {
        const [row] = await this.database
            .select({ type: ticketTypes, category: ticketCategories })
            .from(ticketTypes)
            .innerJoin(ticketCategories, eq(ticketCategories.id, ticketTypes.categoryId))
            .where(eq(ticketTypes.id, input.typeId))
            .limit(1);
        if (row === undefined) {
            throw new NotFoundError("Ticket type");
        }
        const { categories, settings } = await this.config.config(now);
        const availability =
            categories.flatMap((category) => category.types).find((type) => type.record.id === row.type.id)?.availability ??
            TicketAvailability.Disabled;
        if (availability !== TicketAvailability.Available) {
            throw new ConflictError(availabilityMessages[availability], ErrorCode.TicketUnavailable);
        }
        const answers = cleanAnswers(row.type.questions, input.answers);
        const limit = settings?.maxOpenPerUser ?? 3;
        const [openByOpener] = await this.database
            .select({ total: count() })
            .from(tickets)
            .where(and(eq(tickets.openerDiscordId, input.opener.discordId), eq(tickets.status, TicketStatus.Open)));
        if ((openByOpener?.total ?? 0) >= limit) {
            throw new ConflictError(
                `You can have at most ${limit} open tickets. Close one before opening another.`,
                ErrorCode.TicketUnavailable
            );
        }
        try {
            const saved = await this.database.transaction(async (transaction) => {
                const [ticket] = await transaction
                    .insert(tickets)
                    .values({
                        typeId: row.type.id,
                        categoryId: row.category.id,
                        typeName: row.type.name,
                        categoryName: row.category.name,
                        kind: row.type.kind,
                        stage: row.type.kind === TicketKind.Application ? ApplicationStage.Submitted : null,
                        openerDiscordId: input.opener.discordId,
                        openerUsername: input.opener.username,
                        answers
                    })
                    .returning();
                if (ticket === undefined) {
                    throw new Error("Ticket insert returned no row.");
                }
                await transaction.insert(ticketEvents).values({
                    ticketId: ticket.id,
                    kind: TicketEventKind.Opened,
                    actorDiscordId: input.opener.discordId,
                    actorUsername: input.opener.username
                });
                return ticket;
            });
            return saved;
        } catch (error: unknown) {
            if (isUniqueViolation(error, "tickets_one_open_per_opener_type")) {
                throw new ConflictError("You already have an open ticket of this type.", ErrorCode.DuplicateTicket);
            }
            throw error;
        }
    }

    public async bind(id: string, input: BindTicketDto): Promise<TicketRecord> {
        const values: Partial<typeof tickets.$inferInsert> = {};
        if (input.threadId !== undefined) {
            values.threadId = input.threadId;
        }
        if (input.introMessageId !== undefined) {
            values.introMessageId = input.introMessageId;
        }
        if (input.notificationChannelId !== undefined) {
            values.notificationChannelId = input.notificationChannelId;
        }
        if (input.notificationMessageId !== undefined) {
            values.notificationMessageId = input.notificationMessageId;
        }
        const [saved] = await this.database
            .update(tickets)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(tickets.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket");
        }
        return saved;
    }

    public async setStage(id: string, input: StageInput, actor: TicketPersonDto, scope: TicketScope): Promise<TicketRecord> {
        await this.get(id, scope);
        const { ticket, event, filledPosition } = await this.database.transaction(async (transaction) => {
            const [current] = await transaction.select().from(tickets).where(eq(tickets.id, id)).limit(1).for("update");
            if (current === undefined) {
                throw new NotFoundError("Ticket");
            }
            if (current.kind !== TicketKind.Application || current.stage === null) {
                throw new BadRequestError("Only applications move through review stages.", ErrorCode.InvalidStatusTransition);
            }
            if (current.status === TicketStatus.Closed) {
                throw new ConflictError("This ticket is closed.", ErrorCode.TicketClosed);
            }
            if (current.openerDiscordId === actor.discordId) {
                throw new ForbiddenError("You cannot review your own application.");
            }
            if (!applicationStageTransitions[current.stage].includes(input.stage)) {
                throw new ConflictError(
                    `An application that is ${current.stage} cannot move to ${input.stage}.`,
                    ErrorCode.InvalidStatusTransition
                );
            }
            const isDecision = input.stage === ApplicationStage.Accepted || input.stage === ApplicationStage.Rejected;
            const now = new Date();
            const [saved] = await transaction
                .update(tickets)
                .set({
                    stage: input.stage,
                    decidedByDiscordId: isDecision ? actor.discordId : current.decidedByDiscordId,
                    decidedByUsername: isDecision ? actor.username : current.decidedByUsername,
                    decidedAt: isDecision ? now : current.decidedAt,
                    decisionNote: isDecision ? input.note : current.decisionNote,
                    lastActivityAt: now,
                    updatedAt: now
                })
                .where(eq(tickets.id, id))
                .returning();
            if (saved === undefined) {
                throw new Error("Ticket stage update returned no row.");
            }
            const [recorded] = await transaction
                .insert(ticketEvents)
                .values({
                    ticketId: id,
                    kind: TicketEventKind.StageChanged,
                    actorDiscordId: actor.discordId,
                    actorUsername: actor.username,
                    stage: input.stage,
                    note: input.note
                })
                .returning();
            let filled = false;
            if (input.stage === ApplicationStage.Accepted && current.typeId !== null) {
                const [type] = await transaction
                    .update(ticketTypes)
                    .set({ filledCount: sql`${ticketTypes.filledCount} + 1`, updatedAt: now })
                    .where(eq(ticketTypes.id, current.typeId))
                    .returning();
                if (
                    type !== undefined &&
                    type.openings !== null &&
                    type.filledCount >= type.openings &&
                    type.positionStatus !== PositionStatus.Filled
                ) {
                    await transaction
                        .update(ticketTypes)
                        .set({ positionStatus: PositionStatus.Filled, updatedAt: now })
                        .where(eq(ticketTypes.id, type.id));
                    filled = true;
                }
            }
            return { ticket: saved, event: recorded, filledPosition: filled };
        });
        this.announce(event, ticket);
        if (filledPosition) {
            this.notifier.notify({ type: NotificationType.TicketConfigUpdated, actor: actor, removedHubs: [] });
        }
        return ticket;
    }

    public async close(id: string, input: CloseInput, actor: TicketPersonDto, scope: TicketScope): Promise<TicketRecord> {
        await this.get(id, scope);
        const now = new Date();
        const [saved] = await this.database
            .update(tickets)
            .set({
                status: TicketStatus.Closed,
                closedByDiscordId: actor.discordId,
                closedByUsername: actor.username,
                closedAt: now,
                closeReason: input.reason,
                lastActivityAt: now,
                updatedAt: now
            })
            .where(and(eq(tickets.id, id), eq(tickets.status, TicketStatus.Open)))
            .returning();
        if (saved === undefined) {
            throw new ConflictError("This ticket is already closed.", ErrorCode.TicketClosed);
        }
        await this.record(saved, TicketEventKind.Closed, actor, { note: input.reason });
        return saved;
    }

    public async reopen(id: string, input: ReopenInput, actor: TicketPersonDto, scope: TicketScope): Promise<TicketRecord> {
        await this.get(id, scope);
        const now = new Date();
        let saved: TicketRecord | undefined;
        try {
            [saved] = await this.database
                .update(tickets)
                .set({
                    status: TicketStatus.Open,
                    closedByDiscordId: null,
                    closedByUsername: null,
                    closedAt: null,
                    closeReason: null,
                    lastActivityAt: now,
                    updatedAt: now
                })
                .where(and(eq(tickets.id, id), eq(tickets.status, TicketStatus.Closed)))
                .returning();
        } catch (error: unknown) {
            if (isUniqueViolation(error, "tickets_one_open_per_opener_type")) {
                throw new ConflictError("The member already has another open ticket of this type.", ErrorCode.DuplicateTicket);
            }
            throw error;
        }
        if (saved === undefined) {
            throw new ConflictError("This ticket is already open.");
        }
        await this.record(saved, TicketEventKind.Reopened, actor, { note: input.reason });
        return saved;
    }

    public async assign(id: string, input: AssignInput, actor: TicketPersonDto, scope: TicketScope): Promise<TicketRecord> {
        const current = await this.get(id, scope);
        if (current.assigneeDiscordId === (input.assignee?.discordId ?? null)) {
            return current;
        }
        const now = new Date();
        const [saved] = await this.database
            .update(tickets)
            .set({
                assigneeDiscordId: input.assignee?.discordId ?? null,
                assigneeUsername: input.assignee?.username ?? null,
                lastActivityAt: now,
                updatedAt: now
            })
            .where(eq(tickets.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket");
        }
        await this.record(saved, TicketEventKind.Assigned, actor, { target: input.assignee });
        return saved;
    }

    public async addMember(id: string, input: AddMemberInput, actor: TicketPersonDto, scope: TicketScope): Promise<TicketRecord> {
        const ticket = await this.get(id, scope);
        if (ticket.status === TicketStatus.Closed) {
            throw new ConflictError("This ticket is closed.", ErrorCode.TicketClosed);
        }
        if (ticket.threadId === null) {
            throw new ConflictError("This ticket has no Discord thread yet.");
        }
        await this.record(ticket, TicketEventKind.MemberAdded, actor, { target: input.member });
        return ticket;
    }

    public async note(id: string, content: string, actor: TicketPersonDto, scope: TicketScope): Promise<TicketEventRecord> {
        const ticket = await this.get(id, scope);
        return this.record(ticket, TicketEventKind.Note, actor, { note: content });
    }

    public async reply(
        id: string,
        content: string,
        author: TicketPersonDto,
        avatarUrl: string | null,
        scope: TicketScope
    ): Promise<TicketMessageRecord> {
        const ticket = await this.get(id, scope);
        if (ticket.status === TicketStatus.Closed) {
            throw new ConflictError("Reopen the ticket before replying.", ErrorCode.TicketClosed);
        }
        if (ticket.threadId === null) {
            throw new ConflictError("This ticket has no Discord thread yet.");
        }
        const [message] = await this.database
            .insert(ticketMessages)
            .values({
                ticketId: id,
                source: TicketMessageSource.Web,
                authorDiscordId: author.discordId,
                authorUsername: author.username,
                authorAvatarUrl: avatarUrl,
                content
            })
            .returning();
        if (message === undefined) {
            throw new Error("Ticket reply insert returned no row.");
        }
        await this.touch(id);
        this.notifier.notify({
            type: NotificationType.TicketActivity,
            ticketId: id,
            eventId: message.id,
            kind: TicketEventKind.Reply,
            actor: author,
            stage: null,
            target: null,
            note: null,
            reply: { messageId: message.id, content, avatarUrl }
        });
        return message;
    }

    public async linkMessage(ticketId: string, messageId: string, discordMessageId: string): Promise<void> {
        const updated = await this.database
            .update(ticketMessages)
            .set({ discordMessageId })
            .where(and(eq(ticketMessages.id, messageId), eq(ticketMessages.ticketId, ticketId)))
            .returning({ id: ticketMessages.id });
        if (updated.length === 0) {
            throw new NotFoundError("Ticket message");
        }
    }

    public async recordMessages(ticketId: string, messages: readonly RecordMessageInput[]): Promise<number> {
        await this.get(ticketId);
        if (messages.length === 0) {
            return 0;
        }
        await this.database
            .insert(ticketMessages)
            .values(
                messages.map((message) => ({
                    ticketId,
                    discordMessageId: message.discordMessageId,
                    source: TicketMessageSource.Discord,
                    authorDiscordId: message.author.discordId,
                    authorUsername: message.author.username,
                    authorAvatarUrl: message.authorAvatarUrl,
                    content: message.content,
                    attachments: message.attachments,
                    editedAt: message.editedAt === null ? null : new Date(message.editedAt),
                    createdAt: new Date(message.createdAt)
                }))
            )
            .onConflictDoUpdate({
                target: ticketMessages.discordMessageId,
                set: {
                    content: sql`excluded.content`,
                    attachments: sql`excluded.attachments`,
                    editedAt: sql`excluded.edited_at`,
                    authorUsername: sql`excluded.author_username`,
                    authorAvatarUrl: sql`excluded.author_avatar_url`
                }
            });
        const latest = messages.reduce((newest, message) => Math.max(newest, new Date(message.createdAt).getTime()), 0);
        await this.database
            .update(tickets)
            .set({ lastActivityAt: sql`GREATEST(${tickets.lastActivityAt}, ${new Date(latest).toISOString()}::timestamptz)` })
            .where(eq(tickets.id, ticketId));
        return messages.length;
    }

    public async deleteMessage(ticketId: string, discordMessageId: string): Promise<void> {
        await this.database
            .update(ticketMessages)
            .set({ deletedAt: new Date() })
            .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.discordMessageId, discordMessageId)));
    }

    public async openThreadIds(): Promise<{ ticketId: string; threadId: string }[]> {
        const rows = await this.database
            .select({ ticketId: tickets.id, threadId: tickets.threadId })
            .from(tickets)
            .where(eq(tickets.status, TicketStatus.Open));
        return rows.flatMap((row) => (row.threadId === null ? [] : [{ ticketId: row.ticketId, threadId: row.threadId }]));
    }

    private async touch(id: string): Promise<void> {
        const now = new Date();
        await this.database.update(tickets).set({ lastActivityAt: now }).where(eq(tickets.id, id));
    }

    private async record(
        ticket: TicketRecord,
        kind: TicketEventKind,
        actor: TicketPersonDto,
        extras: { note?: string | null; target?: TicketPersonDto | null }
    ): Promise<TicketEventRecord> {
        const [event] = await this.database
            .insert(ticketEvents)
            .values({
                ticketId: ticket.id,
                kind,
                actorDiscordId: actor.discordId,
                actorUsername: actor.username,
                targetDiscordId: extras.target?.discordId ?? null,
                targetUsername: extras.target?.username ?? null,
                note: extras.note ?? null
            })
            .returning();
        if (event === undefined) {
            throw new Error("Ticket event insert returned no row.");
        }
        if (kind !== TicketEventKind.Note) {
            this.announce(event, ticket);
        } else {
            await this.touch(ticket.id);
        }
        return event;
    }

    private announce(event: TicketEventRecord | undefined, ticket: TicketRecord): void {
        if (event === undefined || event.actorDiscordId === null) {
            return;
        }
        const actor: NotificationPerson = { discordId: event.actorDiscordId, username: event.actorUsername ?? "Unknown" };
        this.notifier.notify({
            type: NotificationType.TicketActivity,
            ticketId: ticket.id,
            eventId: event.id,
            kind: event.kind,
            actor,
            stage: event.stage,
            target:
                event.targetDiscordId === null ? null : { discordId: event.targetDiscordId, username: event.targetUsername ?? "Unknown" },
            note: event.note,
            reply: null
        });
    }
}
