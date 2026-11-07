import {
    NotificationType,
    TicketAvailability,
    TicketKind,
    TicketStatus,
    ticketAvailability,
    ticketLimits,
    type createTicketCategorySchema,
    type DepartmentDeskDto,
    type ensureDepartmentDeskSchema,
    type createTicketHubSchema,
    type createTicketTypeSchema,
    type DiscordDirectoryDto,
    type NotificationPerson,
    type PublicPositionsDto,
    type updateDiscordDirectorySchema,
    type updateTicketCategorySchema,
    type updateTicketHubSchema,
    type updateTicketSettingsSchema,
    type updateTicketTypeSchema
} from "@platform/contracts";
import { asc, count, eq } from "drizzle-orm";
import type { z } from "zod";
import { BadRequestError, ConflictError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import {
    departments,
    discordDirectory,
    ticketCategories,
    ticketHubs,
    tickets,
    ticketSettings,
    ticketTypes,
    type TicketCategoryRecord,
    type TicketHubRecord,
    type TicketSettingsRecord,
    type TicketTypeRecord
} from "../../Infrastructure/Database/Schema.js";
import type { Notifier } from "../../Infrastructure/Notifications/Notification.js";
import { departmentDeskTemplate } from "./DepartmentDesk.js";

export type UpdateSettingsInput = z.output<typeof updateTicketSettingsSchema>;
export type CreateHubInput = z.output<typeof createTicketHubSchema>;
export type UpdateHubInput = z.output<typeof updateTicketHubSchema>;
export type CreateCategoryInput = z.output<typeof createTicketCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateTicketCategorySchema>;
export type CreateTypeInput = z.output<typeof createTicketTypeSchema>;
export type UpdateTypeInput = z.output<typeof updateTicketTypeSchema>;
export type ReplaceDirectoryInput = z.output<typeof updateDiscordDirectorySchema>;
export type EnsureDeskInput = z.output<typeof ensureDepartmentDeskSchema>;
export type DepartmentDeskResult = DepartmentDeskDto;

export interface TypeView {
    readonly record: TicketTypeRecord;
    readonly availability: TicketAvailability;
    readonly openTicketCount: number;
}

export interface CategoryView {
    readonly record: TicketCategoryRecord;
    readonly types: readonly TypeView[];
}

export interface ConfigView {
    readonly settings: TicketSettingsRecord | null;
    readonly hubs: readonly TicketHubRecord[];
    readonly categories: readonly CategoryView[];
}

function definedEntries<T extends object>(input: T): Partial<T> {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export class TicketConfigService {
    public constructor(
        private readonly database: Database,
        private readonly notifier: Notifier
    ) {}

    public async settings(): Promise<TicketSettingsRecord | null> {
        const [record] = await this.database.select().from(ticketSettings).where(eq(ticketSettings.id, 1)).limit(1);
        return record ?? null;
    }

    public async updateSettings(input: UpdateSettingsInput, actor: NotificationPerson | null): Promise<TicketSettingsRecord> {
        const values = definedEntries(input);
        const [saved] = await this.database
            .insert(ticketSettings)
            .values({ id: 1, ...values })
            .onConflictDoUpdate({ target: ticketSettings.id, set: { ...values, updatedAt: new Date() } })
            .returning();
        if (saved === undefined) {
            throw new Error("Ticket settings upsert returned no row.");
        }
        if (actor !== null) {
            this.configChanged(actor);
        }
        return saved;
    }

    public async config(now: Date = new Date()): Promise<ConfigView> {
        const [settings, hubs, categoryRecords, typeRecords, openCounts] = await Promise.all([
            this.settings(),
            this.database.select().from(ticketHubs).orderBy(asc(ticketHubs.createdAt)),
            this.database.select().from(ticketCategories).orderBy(asc(ticketCategories.position), asc(ticketCategories.createdAt)),
            this.database.select().from(ticketTypes).orderBy(asc(ticketTypes.position), asc(ticketTypes.createdAt)),
            this.database
                .select({ typeId: tickets.typeId, total: count() })
                .from(tickets)
                .where(eq(tickets.status, TicketStatus.Open))
                .groupBy(tickets.typeId)
        ]);
        const openByType = new Map(openCounts.map((row) => [row.typeId, row.total]));
        return {
            settings,
            hubs,
            categories: categoryRecords.map((record) => ({
                record,
                types: typeRecords
                    .filter((type) => type.categoryId === record.id)
                    .map((type) => ({
                        record: type,
                        availability: record.isEnabled ? ticketAvailability(type, now) : TicketAvailability.Disabled,
                        openTicketCount: openByType.get(type.id) ?? 0
                    }))
            }))
        };
    }

    public async createHub(input: CreateHubInput, actor: NotificationPerson): Promise<TicketHubRecord> {
        const [existing] = await this.database.select({ total: count() }).from(ticketHubs);
        if ((existing?.total ?? 0) >= ticketLimits.hubs) {
            throw new ConflictError(`There can be at most ${ticketLimits.hubs} ticket hubs.`);
        }
        await this.requireCategories(input.categoryIds);
        const [saved] = await this.database.insert(ticketHubs).values(input).returning();
        if (saved === undefined) {
            throw new Error("Ticket hub insert returned no row.");
        }
        this.configChanged(actor);
        return saved;
    }

    public async updateHub(id: string, input: UpdateHubInput, actor: NotificationPerson): Promise<TicketHubRecord> {
        const current = await this.requireHub(id);
        if (input.categoryIds !== undefined) {
            await this.requireCategories(input.categoryIds);
        }
        const values: Partial<typeof ticketHubs.$inferInsert> = definedEntries(input);
        const movedChannel = input.channelId !== undefined && input.channelId !== current.channelId;
        if (movedChannel) {
            values.messageId = null;
        }
        const [saved] = await this.database
            .update(ticketHubs)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(ticketHubs.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket hub");
        }
        const removedHubs =
            movedChannel && current.channelId !== null && current.messageId !== null
                ? [{ channelId: current.channelId, messageId: current.messageId }]
                : [];
        this.configChanged(actor, removedHubs);
        return saved;
    }

    public async bindHub(id: string, messageId: string | null): Promise<TicketHubRecord> {
        const [saved] = await this.database
            .update(ticketHubs)
            .set({ messageId, updatedAt: new Date() })
            .where(eq(ticketHubs.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket hub");
        }
        return saved;
    }

    public async deleteHub(id: string, actor: NotificationPerson): Promise<void> {
        const [deleted] = await this.database.delete(ticketHubs).where(eq(ticketHubs.id, id)).returning();
        if (deleted === undefined) {
            throw new NotFoundError("Ticket hub");
        }
        const removedHubs =
            deleted.channelId !== null && deleted.messageId !== null
                ? [{ channelId: deleted.channelId, messageId: deleted.messageId }]
                : [];
        this.configChanged(actor, removedHubs);
    }

    public async createCategory(input: CreateCategoryInput, actor: NotificationPerson): Promise<TicketCategoryRecord> {
        const [existing] = await this.database.select({ total: count() }).from(ticketCategories);
        if ((existing?.total ?? 0) >= ticketLimits.categories) {
            throw new ConflictError(`There can be at most ${ticketLimits.categories} ticket categories.`);
        }
        const [saved] = await this.database.insert(ticketCategories).values(input).returning();
        if (saved === undefined) {
            throw new Error("Ticket category insert returned no row.");
        }
        this.configChanged(actor);
        return saved;
    }

    public async updateCategory(id: string, input: UpdateCategoryInput, actor: NotificationPerson): Promise<TicketCategoryRecord> {
        const [saved] = await this.database
            .update(ticketCategories)
            .set({ ...definedEntries(input), updatedAt: new Date() })
            .where(eq(ticketCategories.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket category");
        }
        this.configChanged(actor);
        return saved;
    }

    public async deleteCategory(id: string, actor: NotificationPerson): Promise<void> {
        const deleted = await this.database
            .delete(ticketCategories)
            .where(eq(ticketCategories.id, id))
            .returning({ id: ticketCategories.id });
        if (deleted.length === 0) {
            throw new NotFoundError("Ticket category");
        }
        const hubs = await this.database.select().from(ticketHubs);
        for (const hub of hubs.filter((candidate) => candidate.categoryIds.includes(id))) {
            await this.database
                .update(ticketHubs)
                .set({ categoryIds: hub.categoryIds.filter((categoryId) => categoryId !== id), updatedAt: new Date() })
                .where(eq(ticketHubs.id, hub.id));
        }
        this.configChanged(actor);
    }

    public async createType(input: CreateTypeInput, actor: NotificationPerson): Promise<TicketTypeRecord> {
        await this.requireCategory(input.categoryId);
        await this.requireRoomInCategory(input.categoryId);
        const [saved] = await this.database
            .insert(ticketTypes)
            .values({
                ...input,
                opensAt: input.opensAt === null ? null : new Date(input.opensAt),
                closesAt: input.closesAt === null ? null : new Date(input.closesAt)
            })
            .returning();
        if (saved === undefined) {
            throw new Error("Ticket type insert returned no row.");
        }
        this.configChanged(actor);
        return saved;
    }

    public async updateType(id: string, input: UpdateTypeInput, actor: NotificationPerson): Promise<TicketTypeRecord> {
        const current = await this.requireType(id);
        if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
            await this.requireCategory(input.categoryId);
            await this.requireRoomInCategory(input.categoryId);
        }
        const { resetFilledCount, opensAt, closesAt, ...rest } = input;
        const values: Partial<typeof ticketTypes.$inferInsert> = definedEntries(rest);
        if (opensAt !== undefined) {
            values.opensAt = opensAt === null ? null : new Date(opensAt);
        }
        if (closesAt !== undefined) {
            values.closesAt = closesAt === null ? null : new Date(closesAt);
        }
        if (resetFilledCount === true) {
            values.filledCount = 0;
        }
        const nextOpensAt = values.opensAt === undefined ? current.opensAt : values.opensAt;
        const nextClosesAt = values.closesAt === undefined ? current.closesAt : values.closesAt;
        if (nextOpensAt !== null && nextClosesAt !== null && nextClosesAt.getTime() <= nextOpensAt.getTime()) {
            throw new BadRequestError("The application window must close after it opens.", ErrorCode.ValidationFailed);
        }
        const [saved] = await this.database
            .update(ticketTypes)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(ticketTypes.id, id))
            .returning();
        if (saved === undefined) {
            throw new NotFoundError("Ticket type");
        }
        this.configChanged(actor);
        return saved;
    }

    public async deleteType(id: string, actor: NotificationPerson): Promise<void> {
        const deleted = await this.database.delete(ticketTypes).where(eq(ticketTypes.id, id)).returning({ id: ticketTypes.id });
        if (deleted.length === 0) {
            throw new NotFoundError("Ticket type");
        }
        this.configChanged(actor);
    }

    public async ensureDepartmentDesk(
        departmentId: string,
        input: EnsureDeskInput,
        actor: NotificationPerson
    ): Promise<DepartmentDeskResult> {
        const [department] = await this.database
            .select({ id: departments.id })
            .from(departments)
            .where(eq(departments.id, departmentId))
            .limit(1);
        if (department === undefined) {
            throw new NotFoundError("Department");
        }
        const template = departmentDeskTemplate(input.departmentName);
        const result = await this.database.transaction(async (transaction) => {
            let created = false;
            let changed = false;
            let [category] = await transaction
                .select()
                .from(ticketCategories)
                .where(eq(ticketCategories.departmentId, departmentId))
                .limit(1);
            if (category === undefined) {
                [category] = await transaction
                    .insert(ticketCategories)
                    .values({
                        name: template.category.name,
                        description: template.category.description,
                        departmentId,
                        threadChannelId: input.applyChannelId,
                        notificationChannelId: input.notificationChannelId,
                        staffRoleIds: input.staffRoleIds
                    })
                    .returning();
                if (category === undefined) {
                    throw new Error("Department ticket category insert returned no row.");
                }
                await transaction.insert(ticketTypes).values([
                    {
                        categoryId: category.id,
                        name: template.application.name,
                        description: template.application.description,
                        kind: TicketKind.Application,
                        position: 0,
                        questions: template.application.questions,
                        listing: template.application.listing
                    },
                    {
                        categoryId: category.id,
                        name: template.question.name,
                        description: template.question.description,
                        kind: TicketKind.Support,
                        position: 10,
                        questions: template.question.questions
                    }
                ]);
                created = true;
            } else {
                const fill: Partial<typeof ticketCategories.$inferInsert> = {};
                if (category.threadChannelId === null) {
                    fill.threadChannelId = input.applyChannelId;
                }
                if (category.notificationChannelId === null && input.notificationChannelId !== null) {
                    fill.notificationChannelId = input.notificationChannelId;
                }
                if (category.staffRoleIds.length === 0 && input.staffRoleIds.length > 0) {
                    fill.staffRoleIds = input.staffRoleIds;
                }
                if (Object.keys(fill).length > 0) {
                    await transaction
                        .update(ticketCategories)
                        .set({ ...fill, updatedAt: new Date() })
                        .where(eq(ticketCategories.id, category.id));
                    changed = true;
                }
            }
            let [hub] = await transaction.select().from(ticketHubs).where(eq(ticketHubs.departmentId, departmentId)).limit(1);
            if (hub === undefined) {
                [hub] = await transaction
                    .insert(ticketHubs)
                    .values({
                        name: template.hub.name,
                        title: template.hub.title,
                        description: template.hub.description,
                        style: template.hub.style,
                        channelId: input.applyChannelId,
                        categoryIds: [category.id],
                        departmentId
                    })
                    .returning();
                if (hub === undefined) {
                    throw new Error("Department ticket hub insert returned no row.");
                }
                created = true;
            } else if (hub.channelId === null) {
                await transaction
                    .update(ticketHubs)
                    .set({ channelId: input.applyChannelId, messageId: null, updatedAt: new Date() })
                    .where(eq(ticketHubs.id, hub.id));
                changed = true;
            }
            return { categoryId: category.id, hubId: hub.id, created, changed };
        });
        if (result.created || result.changed) {
            this.configChanged(actor);
        }
        return result;
    }

    public async publicPositions(now: Date = new Date()): Promise<PublicPositionsDto> {
        const [{ hubs, categories }, directory] = await Promise.all([this.config(now), this.directory()]);
        const guildId = directory.guildId;
        const hubUrlFor = (categoryId: string): string | null => {
            const hub = hubs.find(
                (candidate) =>
                    candidate.isEnabled &&
                    candidate.channelId !== null &&
                    (candidate.categoryIds.length === 0 || candidate.categoryIds.includes(categoryId))
            );
            return hub?.channelId === undefined || hub.channelId === null || guildId === null
                ? null
                : `https://discord.com/channels/${guildId}/${hub.channelId}`;
        };
        return {
            positions: categories
                .filter((category) => category.record.isEnabled)
                .flatMap((category) =>
                    category.types
                        .filter((type) => type.record.kind === TicketKind.Application && type.availability !== TicketAvailability.Disabled)
                        .map((type) => ({
                            id: type.record.id,
                            name: type.record.name,
                            categoryName: category.record.name,
                            description: type.record.description,
                            emoji: type.record.emoji,
                            availability: type.availability,
                            openings: type.record.openings,
                            filledCount: type.record.filledCount,
                            opensAt: type.record.opensAt?.toISOString() ?? null,
                            closesAt: type.record.closesAt?.toISOString() ?? null,
                            listing: type.record.listing ?? null,
                            applyUrl: hubUrlFor(category.record.id)
                        }))
                )
        };
    }

    public async directory(): Promise<DiscordDirectoryDto> {
        const [record] = await this.database.select().from(discordDirectory).where(eq(discordDirectory.id, 1)).limit(1);
        if (record === undefined) {
            return { guildId: null, channels: [], roles: [], members: [], syncedAt: null };
        }
        return {
            guildId: record.guildId,
            channels: record.channels,
            roles: record.roles,
            members: record.members,
            syncedAt: record.updatedAt.toISOString()
        };
    }

    public async memberRoleIds(discordId: string): Promise<readonly string[]> {
        const directory = await this.directory();
        return directory.members.find((member) => member.id === discordId)?.roleIds ?? [];
    }

    public async replaceDirectory(input: ReplaceDirectoryInput): Promise<DiscordDirectoryDto> {
        const values = { guildId: input.guildId, channels: input.channels, roles: input.roles, members: input.members };
        await this.database
            .insert(discordDirectory)
            .values({ id: 1, ...values })
            .onConflictDoUpdate({ target: discordDirectory.id, set: { ...values, updatedAt: new Date() } });
        await this.database
            .insert(ticketSettings)
            .values({ id: 1, guildId: input.guildId })
            .onConflictDoUpdate({ target: ticketSettings.id, set: { guildId: input.guildId } });
        return this.directory();
    }

    private async requireHub(id: string): Promise<TicketHubRecord> {
        const [record] = await this.database.select().from(ticketHubs).where(eq(ticketHubs.id, id)).limit(1);
        if (record === undefined) {
            throw new NotFoundError("Ticket hub");
        }
        return record;
    }

    private async requireCategory(id: string): Promise<TicketCategoryRecord> {
        const [record] = await this.database.select().from(ticketCategories).where(eq(ticketCategories.id, id)).limit(1);
        if (record === undefined) {
            throw new NotFoundError("Ticket category");
        }
        return record;
    }

    private async requireCategories(ids: readonly string[]): Promise<void> {
        if (ids.length === 0) {
            return;
        }
        const known = new Set((await this.database.select({ id: ticketCategories.id }).from(ticketCategories)).map((row) => row.id));
        if (ids.some((id) => !known.has(id))) {
            throw new BadRequestError("A hub can only show existing categories.", ErrorCode.ValidationFailed);
        }
    }

    private async requireType(id: string): Promise<TicketTypeRecord> {
        const [record] = await this.database.select().from(ticketTypes).where(eq(ticketTypes.id, id)).limit(1);
        if (record === undefined) {
            throw new NotFoundError("Ticket type");
        }
        return record;
    }

    private async requireRoomInCategory(categoryId: string): Promise<void> {
        const [existing] = await this.database.select({ total: count() }).from(ticketTypes).where(eq(ticketTypes.categoryId, categoryId));
        if ((existing?.total ?? 0) >= ticketLimits.typesPerCategory) {
            throw new ConflictError(`A category can hold at most ${ticketLimits.typesPerCategory} ticket types.`);
        }
    }

    private configChanged(actor: NotificationPerson, removedHubs: { channelId: string; messageId: string }[] = []): void {
        this.notifier.notify({ type: NotificationType.TicketConfigUpdated, actor, removedHubs });
    }
}
