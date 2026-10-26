import {
    departmentDefinitions,
    DocumentSlug,
    EntryStatus,
    NotificationType,
    ReviewDecision,
    Role,
    ShotStatus,
    type ShotType,
    shotTypeToDepartment,
    type PlatformNotification
} from "@platform/contracts";
import { WebhookClient, type Client, type Collection, type ContainerBuilder, type SendableChannels, type Webhook } from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { resolveBotAvatarUrl } from "../Discord/BotAvatar.js";
import { Accent, capitalize, message, panel, person, plain, when } from "../Discord/Ui.js";
import { discordRestOptions } from "../Discord/Rest.js";
import { renderNotification, renderRulesMessage } from "../Views/NotificationViews.js";
import { reviewCard, threadUpdate } from "../Views/TaskViews.js";
import { syncMemberStudioRoles } from "./StudioRoles.js";
import type { TaskForum } from "./TaskForum.js";

export interface WebhookEndpoints {
    readonly telemetry?: string;
    readonly moderationLogs?: string;
    readonly rules?: string;
}

const allowedDiscordWebhookHosts = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);

function isSafeDiscordWebhookUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:") {
            return false;
        }
        const host = url.hostname.toLowerCase();
        return allowedDiscordWebhookHosts.has(host) && url.pathname.startsWith("/api/webhooks/");
    } catch {
        return false;
    }
}

function collectDiscordIds(notification: PlatformNotification): string[] {
    const ids: (string | null | undefined)[] = [];
    const record = notification as Record<string, unknown>;
    for (const key of ["voter", "user", "actor", "author", "claimant", "contributor", "reviewer"]) {
        const value = record[key];
        if (value !== null && typeof value === "object" && "discordId" in value) {
            ids.push((value as { discordId?: string | null }).discordId);
        }
    }
    return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export class NotificationDispatcher {
    private readonly webhookClients: Partial<Record<ChannelPurpose, WebhookClient>> = {};
    private readonly departmentLogsWebhooks = new Map<string, WebhookClient>();
    private lastDeptSync = 0;

    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly settings: SettingsStore,
        private readonly forum: TaskForum,
        private readonly logger: Logger,
        webhooks: WebhookEndpoints = {},
        private readonly api?: PlatformApiClient,
        private readonly webAppUrl?: string
    ) {
        // bypass node 24 undici symbol headers crash
        const webhookOptions = discordRestOptions;
        if (webhooks.telemetry && isSafeDiscordWebhookUrl(webhooks.telemetry)) {
            this.webhookClients[ChannelPurpose.Telemetry] = new WebhookClient({ url: webhooks.telemetry }, webhookOptions);
        }
        if (webhooks.moderationLogs && isSafeDiscordWebhookUrl(webhooks.moderationLogs)) {
            this.webhookClients[ChannelPurpose.ModerationLogs] = new WebhookClient({ url: webhooks.moderationLogs }, webhookOptions);
        }
        if (webhooks.rules && isSafeDiscordWebhookUrl(webhooks.rules)) {
            this.webhookClients[ChannelPurpose.Rules] = new WebhookClient({ url: webhooks.rules }, webhookOptions);
        }
    }

    private async getLogsWebhookForShotType(shotType?: ShotType | null): Promise<WebhookClient | null> {
        if (!shotType) {
            return null;
        }
        const deptSlug = shotTypeToDepartment[shotType];
        if (!deptSlug) {
            return null;
        }
        const cached = this.departmentLogsWebhooks.get(deptSlug);
        if (cached !== undefined && Date.now() - this.lastDeptSync < 60_000) {
            return cached;
        }
        if (this.api !== undefined) {
            try {
                const depts = await this.api.listDepartments();
                for (const dept of depts) {
                    if (dept.discordLogsWebhookUrl && isSafeDiscordWebhookUrl(dept.discordLogsWebhookUrl)) {
                        this.departmentLogsWebhooks.set(
                            dept.slug,
                            new WebhookClient({ url: dept.discordLogsWebhookUrl }, discordRestOptions)
                        );
                    }
                }
                this.lastDeptSync = Date.now();
                return this.departmentLogsWebhooks.get(deptSlug) ?? null;
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to fetch department webhooks for task notification");
            }
        }
        return null;
    }

    private displayNameFor(purpose: ChannelPurpose): string {
        switch (purpose) {
            case ChannelPurpose.Telemetry:
                return "Project Stairway Telemetry";
            case ChannelPurpose.ModerationLogs:
                return "Project Stairway Moderation";
            case ChannelPurpose.Rules:
                return "Project Stairway Guidelines";
            default:
                return "Project Stairway";
        }
    }

    private departmentWebhookName(shotType?: ShotType | null): string {
        if (!shotType) {
            return "Project Stairway Tasks";
        }
        const deptSlug = shotTypeToDepartment[shotType];
        if (!deptSlug) {
            return "Project Stairway Tasks";
        }
        const dept = departmentDefinitions.find((d) => d.slug === deptSlug);
        return dept !== undefined ? `Project Stairway ${dept.name}` : "Project Stairway Tasks";
    }

    private avatarUrl(): string | undefined {
        return resolveBotAvatarUrl(this.client);
    }

    private async sendDepartmentLog(
        shotType: ShotType | null | undefined,
        panelContent: ContainerBuilder,
        failureMessage: string
    ): Promise<void> {
        const hook = await this.getLogsWebhookForShotType(shotType);
        if (hook === null) {
            return;
        }
        await hook
            .send({
                ...message(panelContent),
                username: this.departmentWebhookName(shotType),
                avatarURL: this.avatarUrl()
            })
            .catch((err: unknown) => {
                this.logger.warn({ err }, failureMessage);
            });
    }

    private async getOrCreateWebhook(channel: unknown, purpose: ChannelPurpose): Promise<WebhookClient | null> {
        const cached = this.webhookClients[purpose];
        if (cached !== undefined) {
            return cached;
        }
        const targetName = this.displayNameFor(purpose);
        const editPayload: { name: string } = { name: targetName };
        const ch = channel as {
            fetchWebhooks?: () => Promise<Collection<string, Webhook>>;
            createWebhook?: (options: { name: string }) => Promise<Webhook>;
        };
        if (typeof ch.fetchWebhooks === "function") {
            try {
                const webhooks = await ch.fetchWebhooks();
                const existing = webhooks.find((w) => typeof w.url === "string" && isSafeDiscordWebhookUrl(w.url));
                if (existing?.url) {
                    if (typeof existing.edit === "function") {
                        // align existing webhook entity label and avatar with stairway brand
                        existing.edit(editPayload).catch(() => undefined);
                    }
                    const client = new WebhookClient({ url: existing.url }, discordRestOptions);
                    this.webhookClients[purpose] = client;
                    return client;
                }
                if (typeof ch.createWebhook === "function") {
                    const created = await ch.createWebhook(editPayload);
                    if (created?.url && isSafeDiscordWebhookUrl(created.url)) {
                        const client = new WebhookClient({ url: created.url }, discordRestOptions);
                        this.webhookClients[purpose] = client;
                        return client;
                    }
                }
            } catch (err: unknown) {
                this.logger.warn({ err, purpose }, "failed to auto-discover or create webhook for channel");
            }
        }
        return null;
    }

    public async handle(notification: PlatformNotification): Promise<void> {
        await this.applySideEffects(notification).catch((error: unknown) => {
            this.logger.warn({ err: error, type: notification.type }, "discord side effect failed");
        });
        const memberIds = await this.resolveMembers(notification);
        const context = {
            threadFor: (shotId: string) => this.forum.threadFor(shotId),
            isMember: (discordId: string) => memberIds.has(discordId),
            webAppUrl: this.webAppUrl
        };
        for (const rendered of renderNotification(notification, context)) {
            let webhook = this.webhookClients[rendered.purpose];
            const channel = await this.channel(rendered.purpose);
            if (webhook === undefined && channel !== null) {
                webhook = (await this.getOrCreateWebhook(channel, rendered.purpose)) ?? undefined;
            }
            if (webhook !== undefined) {
                try {
                    await webhook.send({
                        flags: rendered.message.flags,
                        components: rendered.message.components,
                        allowedMentions: rendered.message.allowedMentions,
                        withComponents: true,
                        username: this.displayNameFor(rendered.purpose),
                        avatarURL: this.avatarUrl()
                    });
                    continue;
                } catch (error: unknown) {
                    this.logger.warn({ err: error, purpose: rendered.purpose }, "webhook dispatch failed");
                }
            } else if (channel !== null) {
                // telemetry, moderation logs, and rules must never post under bot user identity
                const webhookOnlyPurposes = new Set([ChannelPurpose.Telemetry, ChannelPurpose.ModerationLogs, ChannelPurpose.Rules]);
                if (!webhookOnlyPurposes.has(rendered.purpose)) {
                    await channel.send(rendered.message);
                }
            }
        }
    }

    private async resolveMembers(notification: PlatformNotification): Promise<Set<string>> {
        const ids = collectDiscordIds(notification);
        if (ids.length === 0) {
            return new Set();
        }
        const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
        if (guild === null) {
            return new Set();
        }
        const memberIds = new Set<string>();
        await Promise.all(
            ids.map(async (id) => {
                if (guild.members.cache?.has(id)) {
                    memberIds.add(id);
                    return;
                }
                const member = await guild.members.fetch(id).catch(() => null);
                if (member !== null) {
                    memberIds.add(id);
                }
            })
        );
        return memberIds;
    }

    private async applySideEffects(notification: PlatformNotification): Promise<void> {
        switch (notification.type) {
            case NotificationType.ShotCreated: {
                await this.forum.ensureThreadFor(notification.shot.id);
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        Accent.Info,
                        "**Task Created**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}**\nDifficulty: ${capitalize(notification.shot.difficulty)} | Scene: ${notification.shot.sceneNumber}`
                    ),
                    "failed to post task created to department logs"
                );
                return;
            }
            case NotificationType.ShotUpdated:
                await this.forum.rename(notification.shot);
                return;
            case NotificationType.ShotDeleted:
                await this.forum.remove(notification.shot);
                return;
            case NotificationType.ShotClaimed: {
                await this.forum.setStatus(notification.shot.id, ShotStatus.Claimed);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        Accent.Info,
                        "**Task Claimed**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}**\nClaimed by ${person(notification.claimant)}.\nDue: ${when(notification.deadlineAt, "f")} (${when(notification.deadlineAt)}).`
                    ),
                    "failed to post task claimed to department logs"
                );
                return;
            }
            case NotificationType.ShotReleased: {
                await this.forum.setStatus(notification.shot.id, ShotStatus.Available);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                const reasonLine = notification.reason ? `\n> ${plain(notification.reason)}` : "";
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        Accent.Warning,
                        "**Task Released**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}**\nReleased by ${person(notification.actor)}. The task is open again.${reasonLine}`
                    ),
                    "failed to post task released to department logs"
                );
                return;
            }
            case NotificationType.ShotExpired: {
                await this.forum.setStatus(notification.shot.id, ShotStatus.Available);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                const who = notification.claimant ? ` Claim by ${person(notification.claimant)} expired.` : "";
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        Accent.Warning,
                        "**Task Claim Expired**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}**\n${who} The task is open again.`
                    ),
                    "failed to post task expired to department logs"
                );
                return;
            }
            case NotificationType.SubmissionCreated: {
                await this.forum.setStatus(notification.shot.id, ShotStatus.Submitted);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                const reviews = await this.channel(ChannelPurpose.TaskSubmissions);
                await reviews?.send(reviewCard(notification, this.forum.threadFor(notification.shot.id)));
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        Accent.Info,
                        "**Deliverable Submitted**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}** (v${notification.version})\nSubmitted by ${person(notification.contributor)} for supervisor review.`
                    ),
                    "failed to post submission created to department logs"
                );
                return;
            }
            case NotificationType.SubmissionReviewed: {
                const approved = notification.decision === ReviewDecision.Approved;
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                await this.forum.setStatus(notification.shot.id, approved ? ShotStatus.Approved : ShotStatus.Claimed);
                const noteLine = notification.notes ? `\n> ${plain(notification.notes)}` : "";
                await this.sendDepartmentLog(
                    notification.shot.shotType,
                    panel(
                        approved ? Accent.Success : Accent.Warning,
                        approved ? "**Deliverable Approved**" : "**Changes Requested**",
                        `**${plain(notification.shot.code)} - ${plain(notification.shot.title)}** (v${notification.version})\nReviewed by ${person(notification.reviewer)}.${noteLine}`
                    ),
                    "failed to post submission review to department logs"
                );
                if (notification.contributor.discordId !== null) {
                    try {
                        const user = await this.client.users.fetch(notification.contributor.discordId);
                        const note = notification.notes ? `\n\n> ${plain(notification.notes)}` : "";
                        if (approved) {
                            await user.send(
                                message(
                                    panel(
                                        Accent.Success,
                                        `**Your deliverable has been approved!**`,
                                        `Your submission for **${plain(notification.shot.code)} - ${plain(notification.shot.title)}** (v${notification.version}) was approved by ${person(notification.reviewer, false)}.${note}`
                                    )
                                )
                            );
                        } else {
                            await user.send(
                                message(
                                    panel(
                                        Accent.Warning,
                                        `**Changes requested on your deliverable**`,
                                        `Your submission for **${plain(notification.shot.code)} - ${plain(notification.shot.title)}** (v${notification.version}) was reviewed by ${person(notification.reviewer, false)} with changes requested.${note}\n\n-# Upload a new version with /submit-task when ready.`
                                    )
                                )
                            );
                        }
                    } catch (error: unknown) {
                        this.logger.warn(
                            { err: error, discordId: notification.contributor.discordId },
                            "failed to DM contributor on submission review"
                        );
                    }
                }
                return;
            }
            case NotificationType.UserBlacklisted:
                if (notification.user.discordId !== null) {
                    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
                    if (guild !== null) {
                        await guild.members
                            .ban(notification.user.discordId, {
                                reason: (notification.reason ?? "Blacklisted on platform").slice(0, 500)
                            })
                            .catch((error: unknown) => {
                                this.logger.warn(
                                    { err: error, discordId: notification.user.discordId },
                                    "failed to ban blacklisted member"
                                );
                            });
                    }
                }
                return;
            case NotificationType.UserReinstated:
                if (notification.user.discordId !== null) {
                    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
                    if (guild !== null) {
                        await guild.bans.remove(notification.user.discordId, "Reinstated on platform").catch((error: unknown) => {
                            this.logger.warn({ err: error, discordId: notification.user.discordId }, "failed to unban reinstated member");
                        });
                    }
                }
                return;
            case NotificationType.UserRoleChanged:
                if (notification.user.discordId !== null) {
                    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
                    if (guild !== null) {
                        const member = await guild.members.fetch(notification.user.discordId).catch(() => null);
                        if (member !== null) {
                            await syncMemberStudioRoles(member, notification.role, notification.specialties, "Platform role updated").catch(
                                (error: unknown) => {
                                    this.logger.warn(
                                        { err: error, discordId: notification.user.discordId },
                                        "failed to sync member studio roles"
                                    );
                                }
                            );
                        }
                    }
                }
                return;
            case NotificationType.ContributorPromoted:
                if (notification.user.discordId !== null) {
                    const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
                    if (guild !== null) {
                        const member = await guild.members.fetch(notification.user.discordId).catch(() => null);
                        if (member !== null) {
                            await syncMemberStudioRoles(member, Role.SeniorContributor, [], "Promoted to senior contributor").catch(
                                (error: unknown) => {
                                    this.logger.warn(
                                        { err: error, discordId: notification.user.discordId },
                                        "failed to sync member studio roles"
                                    );
                                }
                            );
                        }
                    }
                }
                return;
            case NotificationType.EntryStatusChanged:
                if (
                    notification.status === EntryStatus.Approved &&
                    notification.author !== null &&
                    notification.author.discordId !== null
                ) {
                    await this.grantRole(
                        notification.author.discordId,
                        BoundRole.Contributor,
                        `Entry "${notification.entry.title}" approved`
                    );
                    try {
                        const user = await this.client.users.fetch(notification.author.discordId);
                        await user.send(
                            message(
                                panel(
                                    Accent.Success,
                                    `**Your entry has been approved!**`,
                                    `Your submission **${plain(notification.entry.title)}** for **${plain(notification.round.title)}** has been approved and is now on the ballot.`
                                )
                            )
                        );
                    } catch (error: unknown) {
                        this.logger.warn({ err: error, discordId: notification.author.discordId }, "failed to DM user on entry approval");
                    }
                }
                return;
            case NotificationType.DocumentUpdated: {
                if (notification.slug === DocumentSlug.Rules || notification.slug === DocumentSlug.Guidelines) {
                    let rulesWebhook = this.webhookClients[ChannelPurpose.Rules];
                    if (rulesWebhook === undefined) {
                        const rulesChannel = await this.channel(ChannelPurpose.Rules);
                        if (rulesChannel !== null) {
                            rulesWebhook = (await this.getOrCreateWebhook(rulesChannel, ChannelPurpose.Rules)) ?? undefined;
                        }
                    }
                    const rendered = renderRulesMessage(notification);
                    const rulesPayload = {
                        flags: rendered.flags,
                        components: rendered.components as never,
                        allowedMentions: rendered.allowedMentions,
                        withComponents: true
                    };

                    if (rulesWebhook !== undefined) {
                        const existingId = this.settings.rulesMessageId;
                        let edited = false;
                        if (existingId !== undefined) {
                            try {
                                await rulesWebhook.editMessage(existingId, rulesPayload);
                                edited = true;
                                this.logger.info(
                                    { revision: notification.revision, slug: notification.slug, messageId: existingId },
                                    "edited rules webhook message in-place"
                                );
                            } catch (err: unknown) {
                                this.logger.warn({ err, existingId }, "failed to edit rules webhook message, creating new one");
                            }
                        }
                        if (!edited) {
                            try {
                                const posted = await rulesWebhook.send({
                                    ...rulesPayload,
                                    username: this.displayNameFor(ChannelPurpose.Rules),
                                    avatarURL: this.avatarUrl()
                                });
                                await this.settings.update((settings) => {
                                    settings.rulesMessageId = posted.id;
                                });
                                const rulesChannel = await this.channel(ChannelPurpose.Rules);
                                if (rulesChannel !== null && "messages" in rulesChannel) {
                                    await rulesChannel.messages.pin(posted.id).catch(() => undefined);
                                }
                                this.logger.info(
                                    { revision: notification.revision, slug: notification.slug, messageId: posted.id },
                                    "published new rules message via webhook and pinned"
                                );
                            } catch (err: unknown) {
                                this.logger.error({ err }, "failed to post rules via webhook");
                            }
                        }
                        return;
                    }

                    const rulesChannel = await this.channel(ChannelPurpose.Rules);
                    if (rulesChannel !== null && "messages" in rulesChannel) {
                        const botId = this.client.user?.id;
                        const pins = await rulesChannel.messages.fetchPinned().catch(() => null);
                        const pinnedBotMsg = pins?.find((msg) => msg.author.id === botId);
                        if (pinnedBotMsg !== undefined) {
                            await pinnedBotMsg.edit(rendered).catch((err) => {
                                this.logger.error({ err }, "failed to edit pinned rules message");
                            });
                        } else {
                            const posted = await rulesChannel.send(rendered).catch((err) => {
                                this.logger.error({ err }, "failed to post updated rules message");
                                return null;
                            });
                            if (posted !== null) {
                                await posted.pin().catch(() => undefined);
                            }
                        }
                        this.logger.info(
                            { revision: notification.revision, slug: notification.slug },
                            "dynamically synced rules channel message in-place"
                        );
                    }
                }
                return;
            }
            default:
                return;
        }
    }

    private async grantRole(discordId: string, role: BoundRole, reason: string): Promise<void> {
        const roleId = this.settings.role(role);
        if (roleId === undefined) {
            return;
        }
        const guild = await this.client.guilds.fetch(this.guildId);
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member !== null && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, reason.slice(0, 400));
        }
    }

    private async channel(purpose: ChannelPurpose): Promise<SendableChannels | null> {
        const id = this.settings.channel(purpose);
        if (id === undefined) {
            return null;
        }
        const channel = await this.client.channels.fetch(id).catch(() => null);
        if (channel === null || !channel.isSendable() || channel.isDMBased() || channel.guildId !== this.guildId) {
            return null;
        }
        return channel;
    }
}
