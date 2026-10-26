import {
    ApplicationStage,
    defaultTicketMessages,
    DiscordChannelKind,
    effectiveStaffRoleIds,
    type NotificationType,
    TicketEventKind,
    TicketKind,
    TicketStatus,
    type DiscordDirectoryChannelDto,
    type DiscordDirectoryMemberDto,
    type NotificationOf,
    type RecordTicketMessageDto,
    type TicketCategoryDto,
    type TicketConfigDto,
    type TicketDto,
    type TicketHubDto,
    type TicketTypeDto
} from "@platform/contracts";
import {
    AttachmentBuilder,
    ChannelType,
    PermissionFlagsBits,
    ThreadAutoArchiveDuration,
    type Client,
    type Guild,
    type GuildBasedChannel,
    type Message,
    type NonThreadGuildBasedChannel,
    type PartialMessage,
    type SendableChannels,
    type TextChannel,
    type ThreadChannel,
    type Webhook
} from "discord.js";
import type { Logger } from "pino";
import { PlatformApiError, type PlatformApiClient } from "../Api/PlatformApiClient.js";
import { Accent, asEdit, plain, truncate, type V2Message } from "../Discord/Ui.js";
import {
    applicantNotice,
    fillTemplate,
    hubMessage,
    staffCard,
    threadEvent,
    ticketIntro,
    transcriptText,
    webReply,
    type TranscriptLine
} from "../Views/TicketViews.js";

export interface TicketPlacement {
    readonly category: TicketCategoryDto;
    readonly type: TicketTypeDto;
}

export interface StaffSubject {
    readonly roleIds: readonly string[];
    readonly isAdministrator: boolean;
}

type TicketActivity = NotificationOf<NotificationType.TicketActivity>;

const refreshIntervalMs = 5 * 60 * 1000;
const directoryDebounceMs = 10_000;
const historyPages = 20;
const webhookName = "Stairway Tickets";

const channelKinds: Partial<Record<ChannelType, DiscordChannelKind>> = {
    [ChannelType.GuildText]: DiscordChannelKind.Text,
    [ChannelType.GuildAnnouncement]: DiscordChannelKind.Announcement,
    [ChannelType.GuildForum]: DiscordChannelKind.Forum,
    [ChannelType.GuildCategory]: DiscordChannelKind.Category
};

const stageTitles: Readonly<Record<ApplicationStage, string>> = {
    [ApplicationStage.Submitted]: "Application submitted",
    [ApplicationStage.Interview]: "Invited to interview",
    [ApplicationStage.Accepted]: "Application accepted",
    [ApplicationStage.Rejected]: "Application not moving forward"
};

const stageAccents: Readonly<Record<ApplicationStage, Accent>> = {
    [ApplicationStage.Submitted]: Accent.Info,
    [ApplicationStage.Interview]: Accent.Info,
    [ApplicationStage.Accepted]: Accent.Success,
    [ApplicationStage.Rejected]: Accent.Danger
};

export function threadNameOf(ticket: Pick<TicketDto, "number" | "typeName" | "opener">): string {
    return truncate(`#${ticket.number} ${ticket.typeName} | ${ticket.opener.username}`, 100);
}

function componentText(node: unknown): string[] {
    if (Array.isArray(node)) {
        return node.flatMap(componentText);
    }
    if (node === null || typeof node !== "object") {
        return [];
    }
    const record = node as Record<string, unknown>;
    const own = record.type === 10 && typeof record.content === "string" ? [record.content] : [];
    return [...own, ...componentText(record.components)];
}

function messageText(message: Message): string {
    if (message.content.length > 0) {
        return message.content;
    }
    return componentText(message.components.map((component) => component.toJSON())).join("\n");
}

function displayName(message: Message): string {
    return (message.member?.displayName ?? message.author.globalName ?? message.author.username).slice(0, 64);
}

function isConversation(message: Message | PartialMessage): boolean {
    return message.author !== null && !message.author.bot && message.webhookId === null && !message.system;
}

function recordOf(message: Message): RecordTicketMessageDto {
    return {
        discordMessageId: message.id,
        author: { discordId: message.author.id, username: displayName(message) },
        authorAvatarUrl: message.author.displayAvatarURL({ size: 64 }),
        content: message.content.slice(0, 4000),
        attachments: [...message.attachments.values()].slice(0, 10).map((attachment) => ({
            name: attachment.name.slice(0, 256),
            url: attachment.url,
            contentType: attachment.contentType ?? null
        })),
        createdAt: message.createdAt.toISOString(),
        editedAt: message.editedAt?.toISOString() ?? null
    };
}

export class TicketDesk {
    private config: TicketConfigDto | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;
    private directoryTimer: NodeJS.Timeout | null = null;
    private hubChain: Promise<void> = Promise.resolve();
    private readonly threads = new Map<string, string>();
    private readonly webhooks = new Map<string, Webhook | null>();

    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly api: PlatformApiClient,
        private readonly logger: Logger,
        private readonly webAppUrl: string
    ) {}

    public async start(guild: Guild): Promise<void> {
        await this.syncDirectory(guild);
        await this.refresh();
        await this.reconcileHubs([]);
        await this.loadThreads();
        this.refreshTimer = setInterval(() => {
            void this.refresh();
        }, refreshIntervalMs);
    }

    public stop(): void {
        if (this.refreshTimer !== null) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.directoryTimer !== null) {
            clearTimeout(this.directoryTimer);
            this.directoryTimer = null;
        }
    }

    public async onConfigChanged(notification: NotificationOf<NotificationType.TicketConfigUpdated>): Promise<void> {
        await this.refresh();
        await this.reconcileHubs(notification.removedHubs);
    }

    public async republish(): Promise<void> {
        await this.refresh();
        await this.reconcileHubs([]);
    }

    public async snapshot(): Promise<TicketConfigDto> {
        if (this.config === null) {
            await this.refresh();
        }
        if (this.config === null) {
            throw new Error("The ticket configuration could not be loaded.");
        }
        return this.config;
    }

    public async category(categoryId: string): Promise<TicketCategoryDto | null> {
        await this.refresh();
        return (await this.snapshot()).categories.find((category) => category.id === categoryId) ?? null;
    }

    public async hub(hubId: string): Promise<TicketHubDto | null> {
        return (await this.snapshot()).hubs.find((hub) => hub.id === hubId) ?? null;
    }

    public async placement(typeId: string, fresh = true): Promise<TicketPlacement | null> {
        if (fresh) {
            await this.refresh();
        }
        for (const category of (await this.snapshot()).categories) {
            const type = category.types.find((candidate) => candidate.id === typeId);
            if (type !== undefined) {
                return { category, type };
            }
        }
        return null;
    }

    public async placementOf(ticket: TicketDto): Promise<{ category: TicketCategoryDto | null; type: TicketTypeDto | null }> {
        const config = await this.snapshot();
        const category = config.categories.find((candidate) => candidate.id === ticket.categoryId) ?? null;
        const type = category?.types.find((candidate) => candidate.id === ticket.typeId) ?? null;
        return { category, type };
    }

    public async isStaff(ticket: TicketDto, subject: StaffSubject): Promise<boolean> {
        if (subject.isAdministrator) {
            return true;
        }
        const { category, type } = await this.placementOf(ticket);
        if (category === null) {
            return false;
        }
        const allowed = effectiveStaffRoleIds(category, type);
        return subject.roleIds.some((roleId) => allowed.includes(roleId));
    }

    public threadUrl(ticket: TicketDto): string | null {
        return ticket.threadId === null ? null : `https://discord.com/channels/${this.guildId}/${ticket.threadId}`;
    }

    public ticketUrl(ticket: TicketDto): string {
        return `${this.webAppUrl}/studio/tickets/${ticket.id}`;
    }

    public async createThread(ticket: TicketDto, placement: TicketPlacement): Promise<TicketDto> {
        const channelId = placement.type.threadChannelId ?? placement.category.threadChannelId;
        if (channelId === null) {
            throw new Error(`No ticket channel is set for ${placement.category.name}.`);
        }
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (channel === null || channel.type !== ChannelType.GuildText || channel.guildId !== this.guildId) {
            throw new Error(`The ticket channel for ${placement.category.name} must be a text channel in this server.`);
        }
        const thread = await channel.threads.create({
            name: threadNameOf(ticket),
            type: ChannelType.PrivateThread,
            invitable: false,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Ticket #${ticket.number}`
        });
        try {
            await thread.members.add(ticket.opener.discordId);
            const intro = await thread.send(ticketIntro({ ...ticket, threadId: thread.id }));
            const bound = await this.api.bindTicket(ticket.id, { threadId: thread.id, introMessageId: intro.id });
            this.threads.set(thread.id, ticket.id);
            return bound;
        } catch (error: unknown) {
            await thread.delete("Ticket setup failed").catch(() => undefined);
            throw error;
        }
    }

    public async postStaffCard(ticket: TicketDto, placement: TicketPlacement): Promise<TicketDto> {
        const channel = await this.sendable(placement.category.notificationChannelId);
        if (channel === null) {
            return ticket;
        }
        const mentionStaff = placement.type.mentionStaff && placement.category.mentionStaff;
        const roles = mentionStaff ? effectiveStaffRoleIds(placement.category, placement.type) : [];
        const posted = await channel.send(staffCard(ticket, roles));
        return this.api.bindTicket(ticket.id, { notificationChannelId: channel.id, notificationMessageId: posted.id });
    }

    public async logOpened(ticket: TicketDto): Promise<void> {
        await this.log(
            ticket,
            TicketEventKind.Opened,
            threadEvent(
                Accent.Info,
                `**#${ticket.number} ${ticket.typeName} opened** by <@${ticket.opener.discordId}>`,
                ticket.threadId === null ? null : `<#${ticket.threadId}>`,
                null
            )
        );
    }

    public async notifyReceived(ticket: TicketDto): Promise<void> {
        if (ticket.kind !== TicketKind.Application) {
            return;
        }
        await this.dmOpener(
            ticket,
            applicantNotice(
                Accent.Info,
                "Application received",
                `Thanks for applying for **${plain(ticket.typeName, 80)}**. Staff will review it in your ticket, and you will hear back there and here.`,
                null,
                this.threadUrl(ticket)
            )
        );
    }

    public async thread(ticket: TicketDto): Promise<ThreadChannel | null> {
        if (ticket.threadId === null) {
            return null;
        }
        const channel = await this.client.channels.fetch(ticket.threadId).catch(() => null);
        return channel !== null && channel.isThread() ? channel : null;
    }

    public async handleActivity(activity: TicketActivity): Promise<void> {
        const ticket = await this.api.getTicket(activity.ticketId).catch((error: unknown) => {
            this.logger.warn({ err: error, ticket: activity.ticketId }, "failed to load ticket for activity");
            return null;
        });
        if (ticket === null) {
            return;
        }
        const thread = await this.thread(ticket);
        if (thread !== null && ticket.status === TicketStatus.Open && thread.archived === true) {
            await thread.setArchived(false, "Ticket activity").catch(() => undefined);
            await thread.setLocked(false, "Ticket activity").catch(() => undefined);
        }
        const actor = `<@${activity.actor.discordId ?? ""}>`;
        const heading = `#${ticket.number} ${ticket.typeName}`;
        switch (activity.kind) {
            case TicketEventKind.StageChanged:
                await this.announceStage(ticket, thread, activity);
                break;
            case TicketEventKind.Closed: {
                const withdrawn = activity.actor.discordId === ticket.opener.discordId;
                await this.post(
                    thread,
                    threadEvent(
                        Accent.Neutral,
                        `**${withdrawn ? "Closed by the member" : "Ticket closed"}** by ${actor}`,
                        null,
                        activity.note
                    )
                );
                await this.log(
                    ticket,
                    TicketEventKind.Closed,
                    threadEvent(
                        Accent.Neutral,
                        `**${heading} closed** by ${actor}`,
                        `Opened by <@${ticket.opener.discordId}>`,
                        activity.note
                    )
                );
                if (!withdrawn && ticket.threadId !== null) {
                    const isApplication = ticket.kind === TicketKind.Application;
                    await this.dmOpener(
                        ticket,
                        applicantNotice(
                            Accent.Neutral,
                            isApplication ? "Application closed" : "Ticket closed",
                            `Your ${isApplication ? "application" : "ticket"} for **${plain(ticket.typeName, 80)}** was closed by staff.`,
                            activity.note,
                            this.threadUrl(ticket)
                        )
                    );
                }
                break;
            }
            case TicketEventKind.Reopened:
                if (thread !== null) {
                    this.threads.set(thread.id, ticket.id);
                }
                await this.post(thread, threadEvent(Accent.Info, `**Ticket reopened** by ${actor}`, null, activity.note));
                await this.log(
                    ticket,
                    TicketEventKind.Reopened,
                    threadEvent(Accent.Info, `**${heading} reopened** by ${actor}`, null, activity.note)
                );
                break;
            case TicketEventKind.Assigned: {
                const target = activity.target;
                const line =
                    target === null
                        ? `**Unassigned** by ${actor}`
                        : target.discordId === activity.actor.discordId
                          ? `**Claimed** by ${actor}`
                          : `**Assigned to <@${target.discordId ?? ""}>** by ${actor}`;
                await this.post(thread, threadEvent(null, line, null, null));
                await this.log(ticket, TicketEventKind.Assigned, threadEvent(null, `**${heading}:** ${line}`, null, null));
                break;
            }
            case TicketEventKind.MemberAdded: {
                const memberId = activity.target?.discordId ?? null;
                if (memberId !== null && thread !== null) {
                    await thread.members.add(memberId).catch((error: unknown) => {
                        this.logger.warn({ err: error, ticket: ticket.id }, "failed to add a member to a ticket thread");
                    });
                }
                const line = `<@${memberId ?? ""}> **was added** by ${actor}`;
                await this.post(thread, threadEvent(null, line, null, null));
                await this.log(ticket, TicketEventKind.MemberAdded, threadEvent(null, `**${heading}:** ${line}`, null, null));
                break;
            }
            case TicketEventKind.Reply:
                await this.relayReply(ticket, thread, activity);
                return;
            default:
                return;
        }
        await this.refreshIntro(ticket, thread);
        await this.refreshStaffCard(ticket);
        if (activity.kind === TicketEventKind.Closed) {
            await this.finishClosing(ticket, thread);
        }
    }

    public trackedTicket(channelId: string): string | undefined {
        return this.threads.get(channelId);
    }

    public async recordMessage(message: Message): Promise<void> {
        const ticketId = this.threads.get(message.channelId);
        if (ticketId === undefined || !isConversation(message)) {
            return;
        }
        await this.api.recordTicketMessages(ticketId, [recordOf(message)]).catch((error: unknown) => {
            this.logger.warn({ err: error, ticket: ticketId }, "failed to record a ticket message");
        });
    }

    public async recordEdit(message: Message | PartialMessage): Promise<void> {
        if (!this.threads.has(message.channelId)) {
            return;
        }
        const full = message.partial ? await message.fetch().catch(() => null) : message;
        if (full !== null) {
            await this.recordMessage(full);
        }
    }

    public async recordDelete(message: Message | PartialMessage): Promise<void> {
        const ticketId = this.threads.get(message.channelId);
        if (ticketId === undefined) {
            return;
        }
        await this.api.deleteTicketMessage(ticketId, message.id).catch(() => undefined);
    }

    public scheduleDirectorySync(guild: Guild): void {
        if (guild.id !== this.guildId) {
            return;
        }
        if (this.directoryTimer !== null) {
            clearTimeout(this.directoryTimer);
        }
        this.directoryTimer = setTimeout(() => {
            this.directoryTimer = null;
            void this.syncDirectory(guild);
        }, directoryDebounceMs);
    }

    public async syncDirectory(guild: Guild): Promise<void> {
        try {
            const channels = [...(await guild.channels.fetch()).values()]
                .filter((channel): channel is NonThreadGuildBasedChannel => channel !== null)
                .flatMap((channel): DiscordDirectoryChannelDto[] => {
                    const kind = channelKinds[channel.type];
                    return kind === undefined
                        ? []
                        : [{ id: channel.id, name: channel.name, kind, parentId: channel.parentId, position: channel.rawPosition }];
                });
            const roles = [...(await guild.roles.fetch()).values()]
                .filter((role) => role.id !== guild.id)
                .map((role) => ({
                    id: role.id,
                    name: role.name,
                    color: role.colors.primaryColor,
                    position: role.position,
                    isManaged: role.managed
                }));
            const members = [...(await guild.members.fetch()).values()]
                .filter((member) => !member.user.bot)
                .slice(0, 20_000)
                .map((member): DiscordDirectoryMemberDto => ({
                    id: member.id,
                    username: member.user.username.slice(0, 64),
                    displayName: member.displayName.slice(0, 64),
                    avatarUrl: member.displayAvatarURL({ size: 64 }),
                    roleIds: [...member.roles.cache.keys()].filter((roleId) => roleId !== guild.id).slice(0, 250)
                }));
            await this.api.replaceDirectory({ guildId: guild.id, channels, roles, members });
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "failed to sync the server directory");
        }
    }

    public reconcileHubs(removed: readonly { channelId: string; messageId: string }[]): Promise<void> {
        this.hubChain = this.hubChain
            .then(() => this.renderHubs(removed))
            .catch((error: unknown) => {
                this.logger.warn({ err: error }, "failed to publish ticket hubs");
            });
        return this.hubChain;
    }

    private async renderHubs(removed: readonly { channelId: string; messageId: string }[]): Promise<void> {
        for (const stale of removed) {
            await this.deleteMessage(stale.channelId, stale.messageId);
        }
        const { hubs, categories } = await this.snapshot();
        for (const hub of hubs) {
            try {
                await this.renderHub(hub, categories);
            } catch (error: unknown) {
                this.logger.warn({ err: error, hub: hub.id }, "failed to publish a ticket hub");
            }
        }
    }

    private async renderHub(hub: TicketHubDto, categories: readonly TicketCategoryDto[]): Promise<void> {
        if (!hub.isEnabled || hub.channelId === null) {
            if (hub.channelId !== null && hub.messageId !== null) {
                await this.deleteMessage(hub.channelId, hub.messageId);
            }
            if (hub.messageId !== null) {
                await this.api.bindTicketHub(hub.id, null);
            }
            return;
        }
        const channel = await this.sendable(hub.channelId);
        if (channel === null) {
            this.logger.warn({ hub: hub.id, channel: hub.channelId }, "a ticket hub channel is missing or the bot cannot post there");
            return;
        }
        const payload = hubMessage(hub, categories);
        if (hub.messageId !== null) {
            const existing = await channel.messages.fetch(hub.messageId).catch(() => null);
            if (existing !== null) {
                await existing.edit(asEdit(payload));
                return;
            }
        }
        const posted = await channel.send(payload);
        await this.api.bindTicketHub(hub.id, posted.id);
    }

    private async announceStage(ticket: TicketDto, thread: ThreadChannel | null, activity: TicketActivity): Promise<void> {
        const stage = activity.stage;
        if (stage === null || stage === ApplicationStage.Submitted) {
            return;
        }
        const { type } = await this.placementOf(ticket);
        const templates = {
            [ApplicationStage.Interview]: type?.messages.interview ?? defaultTicketMessages.interview,
            [ApplicationStage.Accepted]: type?.messages.accepted ?? defaultTicketMessages.accepted,
            [ApplicationStage.Rejected]: type?.messages.rejected ?? defaultTicketMessages.rejected
        };
        const body = fillTemplate(templates[stage], { position: ticket.typeName, user: ticket.opener.username, ticket: ticket.number });
        const actor = `<@${activity.actor.discordId ?? ""}>`;
        await this.post(thread, threadEvent(stageAccents[stage], `**${stageTitles[stage]}** by ${actor}`, body, activity.note));
        await this.dmOpener(ticket, applicantNotice(stageAccents[stage], stageTitles[stage], body, activity.note, this.threadUrl(ticket)));
        await this.log(
            ticket,
            TicketEventKind.StageChanged,
            threadEvent(
                stageAccents[stage],
                `**#${ticket.number} ${ticket.typeName}: ${stageTitles[stage].toLowerCase()}** by ${actor}`,
                `Applicant <@${ticket.opener.discordId}>`,
                activity.note
            )
        );
    }

    private async relayReply(ticket: TicketDto, thread: ThreadChannel | null, activity: TicketActivity): Promise<void> {
        const reply = activity.reply;
        if (reply === null || thread === null) {
            return;
        }
        const username = `${activity.actor.username} | staff`.slice(0, 80);
        const parent = thread.parent;
        const webhook = parent !== null && parent.type === ChannelType.GuildText ? await this.webhookFor(parent) : null;
        let posted: Message | null = null;
        if (webhook !== null) {
            posted = await webhook
                .send({
                    content: reply.content,
                    username,
                    avatarURL: reply.avatarUrl ?? undefined,
                    threadId: thread.id,
                    allowedMentions: { parse: [] }
                })
                .catch((error: unknown) => {
                    this.logger.warn({ err: error, ticket: ticket.id }, "webhook reply failed, posting as the bot");
                    return null;
                });
        }
        posted ??= await thread.send(webReply(activity.actor.username, reply.content)).catch(() => null);
        if (posted !== null) {
            await this.api.linkTicketReply(ticket.id, reply.messageId, posted.id).catch(() => undefined);
        }
    }

    private async webhookFor(channel: TextChannel): Promise<Webhook | null> {
        if (this.webhooks.has(channel.id)) {
            return this.webhooks.get(channel.id) ?? null;
        }
        const me = channel.guild.members.me;
        if (me === null || !channel.permissionsFor(me).has(PermissionFlagsBits.ManageWebhooks)) {
            this.webhooks.set(channel.id, null);
            return null;
        }
        try {
            const existing = (await channel.fetchWebhooks()).find(
                (hook) => hook.owner?.id === this.client.user?.id && hook.name === webhookName
            );
            const webhook = existing ?? (await channel.createWebhook({ name: webhookName, reason: "Relay ticket replies from the web" }));
            this.webhooks.set(channel.id, webhook);
            return webhook;
        } catch (error: unknown) {
            this.logger.warn({ err: error, channel: channel.id }, "could not set up the ticket reply webhook");
            this.webhooks.set(channel.id, null);
            return null;
        }
    }

    private async finishClosing(ticket: TicketDto, thread: ThreadChannel | null): Promise<void> {
        if (thread !== null) {
            const history = await this.history(thread);
            await this.api.recordTicketMessages(ticket.id, history.filter(isConversation).map(recordOf)).catch((error: unknown) => {
                this.logger.warn({ err: error, ticket: ticket.id }, "failed to sync the ticket history");
            });
            const { settings } = await this.snapshot();
            if (settings.transcriptOnClose) {
                await this.sendTranscript(ticket, history);
            }
            this.threads.delete(thread.id);
            await thread.setLocked(true, "Ticket closed").catch(() => undefined);
            await thread.setArchived(true, "Ticket closed").catch(() => undefined);
        }
    }

    private async history(thread: ThreadChannel): Promise<Message[]> {
        const all: Message[] = [];
        let before: string | undefined;
        for (let page = 0; page < historyPages; page++) {
            const batch = await thread.messages.fetch({ limit: 100, before }).catch(() => null);
            if (batch === null || batch.size === 0) {
                break;
            }
            all.push(...batch.values());
            before = batch.last()?.id;
            if (batch.size < 100) {
                break;
            }
        }
        return all.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
    }

    private async sendTranscript(ticket: TicketDto, history: readonly Message[]): Promise<void> {
        const channel = await this.logChannel(ticket);
        if (channel === null) {
            return;
        }
        const lines: TranscriptLine[] = history.map((message) => ({
            at: message.createdAt,
            author: message.webhookId === null ? displayName(message) : message.author.username,
            content: messageText(message),
            attachments: [...message.attachments.values()].map((attachment) => attachment.url)
        }));
        const file = new AttachmentBuilder(Buffer.from(transcriptText(ticket, lines), "utf8"), { name: `ticket-${ticket.number}.txt` });
        await channel
            .send({
                content: `Transcript for ticket #${ticket.number} | ${this.ticketUrl(ticket)}`,
                files: [file],
                allowedMentions: { parse: [] }
            })
            .catch((error: unknown) => {
                this.logger.warn({ err: error, ticket: ticket.id }, "failed to post a ticket transcript");
            });
    }

    private async refreshIntro(ticket: TicketDto, thread: ThreadChannel | null): Promise<void> {
        if (thread === null || ticket.introMessageId === null) {
            return;
        }
        const intro = await thread.messages.fetch(ticket.introMessageId).catch(() => null);
        await intro?.edit(asEdit(ticketIntro(ticket))).catch((error: unknown) => {
            this.logger.warn({ err: error, ticket: ticket.id }, "failed to update a ticket intro");
        });
    }

    private async refreshStaffCard(ticket: TicketDto): Promise<void> {
        if (ticket.notificationChannelId === null || ticket.notificationMessageId === null) {
            return;
        }
        const channel = await this.sendable(ticket.notificationChannelId);
        const posted = await channel?.messages.fetch(ticket.notificationMessageId).catch(() => null);
        if (posted === null || posted === undefined) {
            return;
        }
        const { category, type } = await this.placementOf(ticket);
        const card = staffCard(ticket, category === null ? [] : effectiveStaffRoleIds(category, type));
        await posted.edit({ components: card.components, flags: card.flags, allowedMentions: { parse: [] } }).catch((error: unknown) => {
            this.logger.warn({ err: error, ticket: ticket.id }, "failed to update a ticket staff card");
        });
    }

    private async dmOpener(ticket: TicketDto, payload: V2Message): Promise<void> {
        const { settings } = await this.snapshot();
        if (!settings.dmApplicants) {
            return;
        }
        const member = await this.client.users.fetch(ticket.opener.discordId).catch(() => null);
        await member?.send(payload).catch(() => {
            this.logger.info({ ticket: ticket.id }, "could not DM the member; the update is in their ticket");
        });
    }

    private async post(thread: ThreadChannel | null, payload: V2Message): Promise<void> {
        await thread?.send(payload).catch((error: unknown) => {
            this.logger.warn({ err: error, thread: thread.id }, "failed to post in a ticket thread");
        });
    }

    private async logChannel(ticket: TicketDto): Promise<(SendableChannels & GuildBasedChannel) | null> {
        const { settings } = await this.snapshot();
        const { category } = await this.placementOf(ticket);
        return this.sendable(category?.logChannelId ?? settings.logChannelId);
    }

    private async log(ticket: TicketDto, kind: TicketEventKind, payload: V2Message): Promise<void> {
        const { settings } = await this.snapshot();
        if (!settings.logEvents.includes(kind)) {
            return;
        }
        const channel = await this.logChannel(ticket);
        await channel?.send(payload).catch((error: unknown) => {
            this.logger.warn({ err: error }, "failed to write a ticket log");
        });
    }

    private async loadThreads(): Promise<void> {
        try {
            for (const { ticketId, threadId } of await this.api.openTicketThreads()) {
                this.threads.set(threadId, ticketId);
            }
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "failed to load open ticket threads");
        }
    }

    private async refresh(): Promise<void> {
        try {
            this.config = await this.api.getTicketConfig();
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "failed to load the ticket configuration");
        }
    }

    private async deleteMessage(channelId: string, messageId: string): Promise<void> {
        const channel = await this.sendable(channelId);
        await channel?.messages.delete(messageId).catch(() => undefined);
    }

    private async sendable(channelId: string | null): Promise<(SendableChannels & GuildBasedChannel) | null> {
        if (channelId === null) {
            return null;
        }
        const channel = await this.client.channels.fetch(channelId).catch(() => null);
        if (channel === null || channel.isDMBased() || !channel.isSendable() || channel.guildId !== this.guildId) {
            return null;
        }
        const me = channel.guild.members.me;
        if (me !== null && !channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)) {
            return null;
        }
        return channel;
    }
}

export function isPlatformConflict(error: unknown, code?: string): error is PlatformApiError {
    return error instanceof PlatformApiError && error.status === 409 && (code === undefined || error.code === code);
}
