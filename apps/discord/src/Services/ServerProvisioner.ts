import { DepartmentSlug, ShotStatus } from "@platform/contracts";
import {
    ChannelType,
    PermissionFlagsBits,
    PermissionsBitField,
    type CategoryChannel,
    type ForumChannel,
    type Guild,
    type GuildBasedChannel,
    type OverwriteResolvable,
    type PermissionOverwriteOptions,
    type Role as DiscordRole,
    type TextChannel,
    type VoiceChannel
} from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { isSafeDiscordWebhookUrl } from "../Discord/Rest.js";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { setUpDepartmentDesk } from "./DepartmentDesks.js";
import {
    contributorRoleName,
    findStudioRole,
    memberPermissions,
    normalizeName,
    permissionsForRole,
    studioRoles,
    StudioTier
} from "./StudioRoles.js";

export const departmentChannelPrefix: Readonly<Record<DepartmentSlug, string>> = Object.freeze({
    [DepartmentSlug.ArtAndWriting]: "art",
    [DepartmentSlug.Assets]: "assets",
    [DepartmentSlug.Animation]: "anim",
    [DepartmentSlug.LightingAndVfx]: "vfx",
    [DepartmentSlug.PostProduction]: "post"
});

export const departmentGrabBoxName: Readonly<Record<DepartmentSlug, string>> = Object.freeze({
    [DepartmentSlug.ArtAndWriting]: "Art-Writing-GrabBox",
    [DepartmentSlug.Assets]: "Assets-GrabBox",
    [DepartmentSlug.Animation]: "Animation-GrabBox",
    [DepartmentSlug.LightingAndVfx]: "Lighting-VFX-GrabBox",
    [DepartmentSlug.PostProduction]: "Post-Production-GrabBox"
});

interface ReconcileWebhookResult {
    readonly activeUrl: string | null;
    readonly activeId: string | null;
    readonly deletedNames: string[];
}

async function reconcileWebhookOnChannel(
    channel: TextChannel,
    canonicalName: string,
    botId: string | undefined,
    exclusiveSystemChannel: boolean,
    logger: Logger
): Promise<ReconcileWebhookResult> {
    const deletedNames: string[] = [];
    let activeUrl: string | null = null;
    let activeId: string | null = null;

    if (typeof channel.fetchWebhooks !== "function") {
        return { activeUrl, activeId, deletedNames };
    }

    try {
        const webhooks = await channel.fetchWebhooks();
        const matching = webhooks.filter((hook) => hook.name.toLowerCase() === canonicalName.toLowerCase());
        const validMatching = matching.filter((hook) => typeof hook.url === "string" && isSafeDiscordWebhookUrl(hook.url));

        let activeHook = validMatching.first();

        if (activeHook !== undefined) {
            activeUrl = activeHook.url;
            activeId = activeHook.id;

            // purge duplicate webhooks sharing the same canonical purpose
            for (const hook of matching.values()) {
                if (hook.id !== activeHook.id && typeof hook.delete === "function") {
                    await hook.delete("Residual duplicate webhook cleanup").catch(() => undefined);
                    deletedNames.push(`${hook.name} (duplicate on #${channel.name})`);
                }
            }
        } else if (typeof channel.createWebhook === "function") {
            const created = await channel.createWebhook({
                name: canonicalName,
                reason: "Studio webhook setup"
            });
            activeHook = created;
            activeUrl = created.url;
            activeId = created.id;
        }

        // remove stray or unauthorized webhooks from managed channel
        for (const hook of webhooks.values()) {
            if (activeHook !== undefined && hook.id === activeHook.id) {
                continue;
            }
            if (typeof hook.delete !== "function") {
                continue;
            }
            const isBotOwned = botId !== undefined && hook.owner?.id === botId;
            const isStudioNamed = /studio|stairway|grabbox/i.test(hook.name);

            if (exclusiveSystemChannel || isBotOwned || isStudioNamed) {
                await hook.delete("Residual studio webhook cleanup").catch(() => undefined);
                deletedNames.push(`${hook.name} (residual on #${channel.name})`);
            }
        }
    } catch (err: unknown) {
        logger.warn({ err, channel: channel.name }, `failed to reconcile webhooks on #${channel.name}`);
    }

    return { activeUrl, activeId, deletedNames };
}

export interface DepartmentProvisionSummary {
    readonly departmentName: string;
    readonly categoryName: string;
    readonly forumName: string;
    readonly channels: readonly string[];
}

export interface ProvisionSummary {
    readonly createdRoles: readonly string[];
    readonly createdChannels: readonly string[];
    readonly boundChannels: readonly string[];
    readonly departments?: readonly DepartmentProvisionSummary[];
    readonly deletedWebhooks?: readonly string[];
}

export interface ServerProvisionerWebhooks {
    readonly telemetry?: string;
    readonly securityAlerts?: string;
    readonly moderationLogs?: string;
    readonly rules?: string;
    readonly taskLogs?: string;
    readonly votingLogs?: string;
    readonly userLogs?: string;
    readonly systemLogs?: string;
}

export const forumTagNames: Readonly<Record<ShotStatus, string>> = {
    [ShotStatus.Available]: "Available",
    [ShotStatus.Claimed]: "Claimed",
    [ShotStatus.Submitted]: "Submitted",
    [ShotStatus.Approved]: "Approved"
};

type SystemChannelPurpose =
    | ChannelPurpose.Announcements
    | ChannelPurpose.ProductionAnnouncements
    | ChannelPurpose.Telemetry
    | ChannelPurpose.SecurityAlerts
    | ChannelPurpose.ModerationLogs
    | ChannelPurpose.TaskLogs
    | ChannelPurpose.VotingLogs
    | ChannelPurpose.UserLogs
    | ChannelPurpose.SystemLogs;

const channelNames: Readonly<Record<SystemChannelPurpose, string>> = {
    [ChannelPurpose.Announcements]: "announcements",
    [ChannelPurpose.ProductionAnnouncements]: "production-announcements",
    [ChannelPurpose.Telemetry]: "telemetry-alerts",
    [ChannelPurpose.SecurityAlerts]: "security-alerts",
    [ChannelPurpose.ModerationLogs]: "moderation-logs",
    [ChannelPurpose.TaskLogs]: "task-logs",
    [ChannelPurpose.VotingLogs]: "voting-logs",
    [ChannelPurpose.UserLogs]: "user-logs",
    [ChannelPurpose.SystemLogs]: "system-logs"
};

const channelAliases: Readonly<Record<SystemChannelPurpose, readonly string[]>> = {
    [ChannelPurpose.Announcements]: ["announcements", "announcement", "studio-announcements"],
    [ChannelPurpose.ProductionAnnouncements]: ["production-announcements", "production-news", "contributor-announcements"],
    [ChannelPurpose.Telemetry]: ["telemetry-alerts", "telemetry", "security-alerts", "bot-alerts", "alerts"],
    [ChannelPurpose.SecurityAlerts]: ["security-alerts", "telemetry-alerts", "telemetry", "bot-alerts", "alerts"],
    [ChannelPurpose.ModerationLogs]: ["moderation-logs", "mod-logs", "supervisor-logs", "mod-log"],
    [ChannelPurpose.TaskLogs]: ["task-logs", "tasks-logs", "tasks", "grabbox-logs"],
    [ChannelPurpose.VotingLogs]: ["voting-logs", "vote-logs", "voting"],
    [ChannelPurpose.UserLogs]: ["user-logs", "users-logs", "role-logs", "users"],
    [ChannelPurpose.SystemLogs]: ["system-logs", "pipeline-logs", "system"]
};

function toPermissionOverwriteOptions(item: OverwriteResolvable): { id: string; options: PermissionOverwriteOptions } | null {
    if (typeof item !== "object" || item === null || !("id" in item)) {
        return null;
    }
    const options: PermissionOverwriteOptions = {};
    if ("allow" in item && item.allow !== undefined) {
        for (const flag of new PermissionsBitField(item.allow).toArray()) {
            options[flag] = true;
        }
    }
    if ("deny" in item && item.deny !== undefined) {
        for (const flag of new PermissionsBitField(item.deny).toArray()) {
            options[flag] = false;
        }
    }
    const targetId = typeof item.id === "string" ? item.id : item.id.id;
    return { id: targetId, options };
}

export class ServerProvisioner {
    public constructor(
        private readonly settings: SettingsStore,
        private readonly logger: Logger,
        private readonly announcementsChannelId?: string,
        private readonly api?: PlatformApiClient,
        private readonly webhooks?: ServerProvisionerWebhooks
    ) {}

    public async bindExisting(guild: Guild): Promise<void> {
        const botId = guild.client?.user?.id;
        const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
        await this.settings.update((settings) => {
            delete settings.channels.welcome;
            delete settings.channels.taskSubmissions;
            delete settings.channels.taskForum;

            const member = roles.find((role) => findStudioRole(role.name)?.name === "Members");
            const voter = roles.find((role) => findStudioRole(role.name)?.name === "Voters");
            const contributor = roles.find((role) => findStudioRole(role.name)?.name === contributorRoleName);
            settings.roles[BoundRole.Member] ??= member?.id;
            settings.roles[BoundRole.Voter] ??= voter?.id;
            settings.roles[BoundRole.Contributor] ??= contributor?.id;
            const platformCategory = channels.find(
                (channel) => channel !== null && channel.type === ChannelType.GuildCategory && normalizeName(channel.name) === "platform"
            );
            const staffCategory = channels.find(
                (channel) => channel !== null && channel.type === ChannelType.GuildCategory && normalizeName(channel.name) === "staff"
            );
            const productionCategory = channels.find(
                (channel) => channel !== null && channel.type === ChannelType.GuildCategory && normalizeName(channel.name) === "production"
            );
            const systemCategoryMap: Record<SystemChannelPurpose, string | undefined> = {
                [ChannelPurpose.Announcements]: platformCategory?.id,
                [ChannelPurpose.ProductionAnnouncements]: productionCategory?.id,
                [ChannelPurpose.Telemetry]: staffCategory?.id,
                [ChannelPurpose.SecurityAlerts]: staffCategory?.id,
                [ChannelPurpose.ModerationLogs]: staffCategory?.id,
                [ChannelPurpose.TaskLogs]: staffCategory?.id,
                [ChannelPurpose.VotingLogs]: staffCategory?.id,
                [ChannelPurpose.UserLogs]: staffCategory?.id,
                [ChannelPurpose.SystemLogs]: staffCategory?.id
            };

            for (const purpose of Object.keys(channelAliases) as SystemChannelPurpose[]) {
                const expectedCategoryId = systemCategoryMap[purpose];
                if (expectedCategoryId === undefined) {
                    continue;
                }
                const aliases = channelAliases[purpose];
                const match = channels.find((channel) => {
                    if (channel === null || channel.type !== ChannelType.GuildText || channel.parentId !== expectedCategoryId) {
                        return false;
                    }
                    const normalized = normalizeName(channel.name);
                    return aliases.some((alias) => normalizeName(alias) === normalized);
                });
                settings.channels[purpose] ??= match?.id;
            }
            if (this.announcementsChannelId !== undefined) {
                // explicit configured announcements channel overrides name heuristic
                settings.channels[ChannelPurpose.Announcements] = this.announcementsChannelId;
            }
        });

        if (this.api !== undefined) {
            try {
                const depts = await this.api.listDepartments();
                for (const dept of depts) {
                    const prefix = departmentChannelPrefix[dept.slug] ?? dept.slug;
                    const category = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildCategory &&
                            (normalizeName(channel.name) === normalizeName(dept.name) ||
                                normalizeName(channel.name) === normalizeName(dept.slug))
                    );
                    if (category === undefined || category === null) {
                        continue;
                    }
                    const grabboxName = departmentGrabBoxName[dept.slug] ?? `${prefix}-grabbox`;
                    const extraAliases: readonly string[] =
                        dept.slug === DepartmentSlug.LightingAndVfx
                            ? ["lighting-vfx-grabbox", "lighting-vfx-tasks"]
                            : dept.slug === DepartmentSlug.ArtAndWriting
                              ? ["art-and-writing-grabbox", "art-and-writing-tasks"]
                              : dept.slug === DepartmentSlug.PostProduction
                                ? ["post-production-grabbox", "post-production-tasks", "post-grabbox", "post-tasks"]
                                : [];
                    const forumAliases = [
                        grabboxName,
                        `${dept.name}-GrabBox`,
                        `${dept.slug}-grabbox`,
                        `${prefix}-grabbox`,
                        `${prefix}-tasks`,
                        `${dept.slug}-tasks`,
                        ...extraAliases
                    ];
                    const deptForum = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildForum &&
                            forumAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    );
                    const chatAliases = [`${prefix}-general`, dept.slug, `${prefix}-chat`, `${dept.slug}-chat`];
                    const deptChat = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildText &&
                            chatAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    const announceAliases = [
                        `${prefix}-announcements`,
                        `${dept.slug}-announcements`,
                        `${prefix}-info`,
                        `${dept.slug}-info`
                    ];
                    const deptAnnounce = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildText &&
                            announceAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;
                    if (deptAnnounce !== undefined && deptAnnounce.name !== `${prefix}-announcements`) {
                        await deptAnnounce.setName(`${prefix}-announcements`, "Rename to department announcements").catch(() => undefined);
                    }

                    const logsAliases = [`${prefix}-logs`, `${dept.slug}-logs`, `${prefix}-task-logs`, `${dept.slug}-task-logs`];
                    const deptLogs = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildText &&
                            logsAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    const applyAliases = [`${prefix}-apply`, `${dept.slug}-apply`, `${prefix}-tickets`, `${dept.slug}-tickets`];
                    const deptApply = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildText &&
                            applyAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    if (deptForum !== undefined && deptForum !== null) {
                        let infoWebhookUrl = dept.discordInfoWebhookUrl ?? null;
                        if (deptAnnounce) {
                            const infoRes = await reconcileWebhookOnChannel(
                                deptAnnounce,
                                `${dept.name} Announcements`,
                                botId,
                                false,
                                this.logger
                            );
                            infoWebhookUrl = infoRes.activeUrl;
                        }
                        let logsWebhookUrl = dept.discordLogsWebhookUrl ?? null;
                        if (deptLogs) {
                            const logsRes = await reconcileWebhookOnChannel(deptLogs, `${dept.name} Logs`, botId, false, this.logger);
                            logsWebhookUrl = logsRes.activeUrl;
                        }

                        await this.api.bindDepartmentDiscordMap(dept.id, {
                            discordCategoryId: category.id,
                            discordForumId: deptForum.id,
                            discordChatChannelId: deptChat?.id ?? null,
                            discordInfoChannelId: deptAnnounce?.id ?? null,
                            discordInfoWebhookUrl: infoWebhookUrl,
                            discordLogsChannelId: deptLogs?.id ?? null,
                            discordLogsWebhookUrl: logsWebhookUrl,
                            discordApplyChannelId: deptApply?.id ?? null
                        });
                        if (deptApply !== undefined) {
                            await setUpDepartmentDesk(this.api, dept, deptApply, deptLogs?.id ?? null, roles.values(), this.logger);
                        }

                        if (deptForum.type === ChannelType.GuildForum && Array.isArray(deptForum.availableTags)) {
                            await this.settings.update((settings) => {
                                for (const status of Object.values(ShotStatus)) {
                                    const tag = deptForum.availableTags.find((candidate) => candidate.name === forumTagNames[status]);
                                    if (tag !== undefined) {
                                        settings.forumTags[status] ??= tag.id;
                                    }
                                }
                            });
                        }
                    }
                }
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to bind existing department channels");
            }
        }

        this.logger.info({ guild: guild.id }, "bound existing server structure");
    }

    public async provision(guild: Guild): Promise<ProvisionSummary> {
        const createdRoles: string[] = [];
        const createdChannels: string[] = [];
        const boundChannels: string[] = [];
        const deletedWebhooks: string[] = [];
        const activeWebhookIds = new Set<string>();
        const existingRoles = await guild.roles.fetch();
        const roleIds = new Map<string, DiscordRole>();

        for (const definition of studioRoles) {
            const permissions = permissionsForRole(definition);
            const existing = existingRoles.find((role) => findStudioRole(role.name)?.name === definition.name);
            if (existing !== undefined) {
                if (existing.hoist !== (definition.tier !== StudioTier.Community)) {
                    await existing.setHoist(definition.tier !== StudioTier.Community, "Studio role setup").catch(() => undefined);
                }
                await existing.setPermissions(permissions, "Studio role setup").catch(() => undefined);
                roleIds.set(definition.name, existing);
                continue;
            }
            const created = await guild.roles.create({
                name: definition.name,
                colors: { primaryColor: definition.color },
                hoist: definition.tier !== StudioTier.Community,
                mentionable: definition.tier !== StudioTier.Community,
                permissions: [...permissions],
                reason: "Studio role setup"
            });
            roleIds.set(definition.name, created);
            createdRoles.push(created.name);
        }

        await this.enforceRoleHierarchy(guild);
        if (typeof guild.roles.everyone?.setPermissions === "function") {
            await guild.roles.everyone.setPermissions(memberPermissions, "Studio base permissions").catch(() => undefined);
        }

        const staffRoles = studioRoles
            .filter((role) => role.tier <= StudioTier.Department)
            .map((role) => roleIds.get(role.name))
            .filter((role): role is DiscordRole => role !== undefined);
        const botId = guild.client.user.id;
        const everyone = guild.roles.everyone.id;
        const channels = await guild.channels.fetch();

        const find = (name: string, type: ChannelType): GuildBasedChannel | undefined =>
            channels.find((channel) => channel !== null && channel.type === type && normalizeName(channel.name) === normalizeName(name)) ??
            undefined;

        const applyOverwrites = async (
            channel: TextChannel | VoiceChannel | CategoryChannel,
            overwrites: OverwriteResolvable[]
        ): Promise<void> => {
            for (const item of overwrites) {
                const parsed = toPermissionOverwriteOptions(item);
                if (parsed !== null) {
                    await channel.permissionOverwrites
                        .create(parsed.id, parsed.options, { reason: "Configure studio channel permissions" })
                        .catch(() => undefined);
                }
            }
        };

        const ensureCategory = async (name: string, overwrites: OverwriteResolvable[]): Promise<CategoryChannel> => {
            const existing = find(name, ChannelType.GuildCategory);
            if (existing?.type === ChannelType.GuildCategory) {
                if (overwrites.length > 0) {
                    await applyOverwrites(existing, overwrites);
                }
                return existing;
            }
            createdChannels.push(name);
            return guild.channels.create({
                name,
                type: ChannelType.GuildCategory,
                permissionOverwrites: overwrites,
                reason: "Studio setup"
            });
        };

        const ensureNamedText = async (
            name: string,
            aliases: readonly string[],
            parent: CategoryChannel,
            topic: string,
            overwrites: OverwriteResolvable[]
        ): Promise<TextChannel> => {
            const existing = channels.find((channel) => {
                if (channel === null || channel.type !== ChannelType.GuildText || channel.parentId !== parent.id) {
                    return false;
                }
                const normalized = normalizeName(channel.name);
                return aliases.some((alias) => normalizeName(alias) === normalized);
            }) as TextChannel | undefined;

            if (existing !== undefined) {
                // leave parent intact to preserve existing channel hierarchy
                if (existing.name !== name) {
                    await existing.setName(name, "Normalize channel name").catch(() => undefined);
                }
                boundChannels.push(`#${existing.name}`);
                await applyOverwrites(existing, overwrites);
                return existing;
            }
            createdChannels.push(`#${name}`);
            return guild.channels.create({
                name,
                type: ChannelType.GuildText,
                parent: parent.id,
                topic,
                permissionOverwrites: overwrites,
                reason: "Studio setup"
            });
        };

        const ensureNamedVoice = async (
            name: string,
            aliases: readonly string[],
            parent: CategoryChannel,
            overwrites: OverwriteResolvable[]
        ): Promise<VoiceChannel> => {
            const existing = channels.find((channel) => {
                if (channel === null || channel.type !== ChannelType.GuildVoice || channel.parentId !== parent.id) {
                    return false;
                }
                const normalized = normalizeName(channel.name);
                return aliases.some((alias) => normalizeName(alias) === normalized);
            }) as VoiceChannel | undefined;

            if (existing !== undefined) {
                // leave parent intact to preserve existing channel hierarchy
                if (existing.name !== name) {
                    await existing.setName(name, "Normalize voice channel name").catch(() => undefined);
                }
                boundChannels.push(existing.name);
                await applyOverwrites(existing, overwrites);
                return existing;
            }
            createdChannels.push(name);
            return guild.channels.create({
                name,
                type: ChannelType.GuildVoice,
                parent: parent.id,
                permissionOverwrites: overwrites,
                reason: "Studio setup"
            });
        };

        const ensureText = async (
            purpose: SystemChannelPurpose,
            parent: CategoryChannel,
            topic: string,
            overwrites: OverwriteResolvable[]
        ): Promise<TextChannel> => {
            const configuredId = this.settings.channel(purpose);
            const channelById = configuredId !== undefined ? channels.get(configuredId) : undefined;
            if (channelById?.type === ChannelType.GuildText) {
                boundChannels.push(`#${channelById.name}`);
                await applyOverwrites(channelById, overwrites);
                return channelById;
            }
            return ensureNamedText(channelNames[purpose], channelAliases[purpose], parent, topic, overwrites);
        };

        const botAccess: OverwriteResolvable = {
            id: botId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageThreads
            ]
        };
        const staffRead: OverwriteResolvable[] = staffRoles.map((role) => ({
            id: role.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
        }));
        const privateOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...staffRead,
            botAccess
        ];
        const readOnlyOverwrites: OverwriteResolvable[] = [
            {
                id: everyone,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads]
            },
            botAccess
        ];

        // retain legacy channels to prevent destructive loss during setup

        const platform = await ensureCategory("Platform", []);
        const staff = await ensureCategory("Staff", privateOverwrites);

        const announcements = await ensureText(
            ChannelPurpose.Announcements,
            platform,
            "Round results and studio news.",
            readOnlyOverwrites
        );

        const announcementsRes = await reconcileWebhookOnChannel(announcements, "Studio Announcements", botId, true, this.logger);
        if (announcementsRes.activeId !== null) {
            activeWebhookIds.add(announcementsRes.activeId);
        }
        deletedWebhooks.push(...announcementsRes.deletedNames);
        const announcementsWebhookUrl = announcementsRes.activeUrl;

        // 1. Task logs channel
        const taskLogs = await ensureText(
            ChannelPurpose.TaskLogs,
            staff,
            "Global task activity, claims, submissions, and supervisor reviews.",
            privateOverwrites
        );
        const taskLogsRes = await reconcileWebhookOnChannel(taskLogs, "Stairway Tasks", botId, true, this.logger);
        if (taskLogsRes.activeId !== null) {
            activeWebhookIds.add(taskLogsRes.activeId);
        }
        deletedWebhooks.push(...taskLogsRes.deletedNames);
        const taskLogsWebhookUrl = taskLogsRes.activeUrl;

        // 2. Voting logs channel
        const votingLogs = await ensureText(
            ChannelPurpose.VotingLogs,
            staff,
            "Ballots cast, round state transitions, and entry status updates.",
            privateOverwrites
        );
        const votingLogsRes = await reconcileWebhookOnChannel(votingLogs, "Stairway Voting", botId, true, this.logger);
        if (votingLogsRes.activeId !== null) {
            activeWebhookIds.add(votingLogsRes.activeId);
        }
        deletedWebhooks.push(...votingLogsRes.deletedNames);
        const votingLogsWebhookUrl = votingLogsRes.activeUrl;

        // 3. User logs channel
        const userLogs = await ensureText(
            ChannelPurpose.UserLogs,
            staff,
            "Role updates, promotions, demotions, and voter blacklists.",
            privateOverwrites
        );
        const userLogsRes = await reconcileWebhookOnChannel(userLogs, "Stairway Users", botId, true, this.logger);
        if (userLogsRes.activeId !== null) {
            activeWebhookIds.add(userLogsRes.activeId);
        }
        deletedWebhooks.push(...userLogsRes.deletedNames);
        const userLogsWebhookUrl = userLogsRes.activeUrl;

        // 4. Security alerts channel (adopting telemetry-alerts)
        const securityAlerts = await ensureText(
            ChannelPurpose.SecurityAlerts,
            staff,
            "Raid alerts, quarantine actions, and AI signature detections.",
            privateOverwrites
        );
        const securityAlertsRes = await reconcileWebhookOnChannel(securityAlerts, "Stairway Security", botId, true, this.logger);
        if (securityAlertsRes.activeId !== null) {
            activeWebhookIds.add(securityAlertsRes.activeId);
        }
        deletedWebhooks.push(...securityAlertsRes.deletedNames);
        const securityAlertsWebhookUrl = securityAlertsRes.activeUrl;

        // 5. System logs channel
        const systemLogs = await ensureText(
            ChannelPurpose.SystemLogs,
            staff,
            "Pipeline progress, crew surveys, and system maintenance logs.",
            privateOverwrites
        );
        const systemLogsRes = await reconcileWebhookOnChannel(systemLogs, "Stairway System", botId, true, this.logger);
        if (systemLogsRes.activeId !== null) {
            activeWebhookIds.add(systemLogsRes.activeId);
        }
        deletedWebhooks.push(...systemLogsRes.deletedNames);
        const systemLogsWebhookUrl = systemLogsRes.activeUrl;

        // 6. Moderation logs channel
        const moderationLogs = await ensureText(
            ChannelPurpose.ModerationLogs,
            staff,
            "Profanity warnings, timeouts, and AutoMod incident logs.",
            privateOverwrites
        );
        const modLogsRes = await reconcileWebhookOnChannel(moderationLogs, "Studio Moderation", botId, true, this.logger);
        if (modLogsRes.activeId !== null) {
            activeWebhookIds.add(modLogsRes.activeId);
        }
        deletedWebhooks.push(...modLogsRes.deletedNames);
        const modLogsWebhookUrl = modLogsRes.activeUrl;

        const contributorRoles = studioRoles
            .filter((role) => role.tier <= StudioTier.Contributor)
            .map((role) => roleIds.get(role.name))
            .filter((role): role is DiscordRole => role !== undefined);

        const productionCategoryOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...contributorRoles.map((role) => ({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
            })),
            botAccess
        ];

        const production = await ensureCategory("Production", productionCategoryOverwrites);

        // production announcements channel (webhook-driven, read-only for contributors)
        const productionAnnouncementsOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...contributorRoles.map((role) => ({
                id: role.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
            })),
            {
                id: botId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageWebhooks
                ]
            }
        ];

        const prodAnnouncements = await ensureNamedText(
            "production-announcements",
            ["production-announcements", "production-news", "contributor-announcements"],
            production,
            "Production milestones, deliverables updates, and contributor announcements.",
            productionAnnouncementsOverwrites
        );

        const prodAnnounceRes = await reconcileWebhookOnChannel(prodAnnouncements, "Production Announcements", botId, true, this.logger);
        if (prodAnnounceRes.activeId !== null) {
            activeWebhookIds.add(prodAnnounceRes.activeId);
        }
        deletedWebhooks.push(...prodAnnounceRes.deletedNames);
        const prodAnnouncementsWebhookUrl = prodAnnounceRes.activeUrl;

        const productionGeneralOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...contributorRoles.map((role) => ({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AddReactions
                ]
            })),
            botAccess
        ];

        await ensureNamedText(
            "production-general",
            ["production-general", "production", "all-contributors", "studio-general"],
            production,
            "General cross-department discussion for all studio contributors.",
            productionGeneralOverwrites
        );

        // strictly for department supervisors and executives (no craft contributors)
        const managementRoles = staffRoles.filter((role) => role.name !== "Media Team");
        const productionManagementOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...managementRoles.map((role) => ({
                id: role.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            })),
            botAccess
        ];

        await ensureNamedText(
            "production-management",
            ["production-management", "production-leads", "supervisor-general", "supervisors", "supervisor-chat"],
            production,
            "Cross-department supervisor and production coordination.",
            productionManagementOverwrites
        );

        const departmentSummaries: DepartmentProvisionSummary[] = [];
        if (this.api !== undefined) {
            try {
                const depts = await this.api.listDepartments();
                for (const dept of depts) {
                    const prefix = departmentChannelPrefix[dept.slug] ?? dept.slug;
                    const category = await ensureCategory(dept.name, []);

                    const deptSpecialties = new Set([...dept.contributorSpecialties, ...dept.supervisorSpecialties]);
                    const deptRoles = studioRoles
                        .filter(
                            (sr) => sr.tier <= StudioTier.Executive || (sr.specialty !== undefined && deptSpecialties.has(sr.specialty))
                        )
                        .map((sr) => roleIds.get(sr.name))
                        .filter((role): role is DiscordRole => role !== undefined);
                    const supervisorRole = roleIds.get("Supervisor");
                    if (supervisorRole !== undefined && !deptRoles.some((r) => r.id === supervisorRole.id)) {
                        deptRoles.push(supervisorRole);
                    }

                    // 1. Announcements channel (<prefix>-announcements)
                    const announceName = `${prefix}-announcements`;
                    const announceAliases = [announceName, `${dept.slug}-announcements`, `${prefix}-info`, `${dept.slug}-info`];
                    const deptAnnounceOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            deny: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        },
                        ...deptRoles.map((role) => ({
                            id: role.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        })),
                        ...staffRoles.map((role) => ({
                            id: role.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [PermissionFlagsBits.SendMessages]
                        })),
                        {
                            id: botId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageWebhooks
                            ]
                        }
                    ];
                    const deptAnnounce = await ensureNamedText(
                        announceName,
                        announceAliases,
                        category,
                        `${dept.name} department announcements and guidelines.`,
                        deptAnnounceOverwrites
                    );
                    if (deptAnnounce.name !== announceName) {
                        await deptAnnounce.setName(announceName, "Rename to department announcements").catch(() => undefined);
                    }
                    const announceRes = await reconcileWebhookOnChannel(
                        deptAnnounce,
                        `${dept.name} Announcements`,
                        botId,
                        false,
                        this.logger
                    );
                    if (announceRes.activeId !== null) {
                        activeWebhookIds.add(announceRes.activeId);
                    }
                    deletedWebhooks.push(...announceRes.deletedNames);
                    const announceWebhookUrl = announceRes.activeUrl;

                    // 2. Apply channel (<prefix>-apply)
                    const applyName = `${prefix}-apply`;
                    const applyAliases = [applyName, `${dept.slug}-apply`, `${prefix}-tickets`, `${dept.slug}-tickets`];
                    const deptApplyOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [PermissionFlagsBits.SendMessages]
                        },
                        ...staffRoles.map((role) => ({
                            id: role.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels]
                        })),
                        {
                            id: botId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.ManageMessages
                            ]
                        }
                    ];
                    const deptApply = await ensureNamedText(
                        applyName,
                        applyAliases,
                        category,
                        `Apply for ${dept.name} department contributor role.`,
                        deptApplyOverwrites
                    );

                    // 3. Grab-box forum (<dept>-grabbox)
                    const tasksForumName = departmentGrabBoxName[dept.slug] ?? `${prefix}-grabbox`;
                    const extraAliases: readonly string[] =
                        dept.slug === DepartmentSlug.LightingAndVfx
                            ? ["lighting-vfx-grabbox", "lighting-vfx-tasks"]
                            : dept.slug === DepartmentSlug.ArtAndWriting
                              ? ["art-and-writing-grabbox", "art-and-writing-tasks"]
                              : dept.slug === DepartmentSlug.PostProduction
                                ? ["post-production-grabbox", "post-production-tasks", "post-grabbox", "post-tasks"]
                                : [];
                    const forumAliases = [
                        tasksForumName,
                        `${dept.name}-GrabBox`,
                        `${dept.slug}-grabbox`,
                        `${prefix}-grabbox`,
                        `${prefix}-tasks`,
                        `${dept.slug}-tasks`,
                        ...extraAliases
                    ];
                    let deptForum = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.parentId === category.id &&
                            channel.type === ChannelType.GuildForum &&
                            forumAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as ForumChannel | undefined;
                    if (deptForum === undefined) {
                        deptForum = await guild.channels.create({
                            name: tasksForumName,
                            type: ChannelType.GuildForum,
                            parent: category.id,
                            topic: `Grab-box tasks for ${dept.name}. Use /take-task in a post to claim it.`,
                            reason: "Studio department setup"
                        });
                        createdChannels.push(tasksForumName);
                    } else {
                        if (deptForum.name !== tasksForumName) {
                            await deptForum.setName(tasksForumName, "Rename to department grabbox").catch(() => undefined);
                        }
                        boundChannels.push(deptForum.name);
                    }
                    await this.ensureForumPermissions(deptForum, deptRoles);
                    await this.ensureForumTags(deptForum, true);

                    // 4. General discussion (<prefix>-general) - department-gated chat
                    const generalName = `${prefix}-general`;
                    const generalAliases = [generalName, dept.slug, `${prefix}-chat`, `${dept.slug}-chat`];

                    const deptGeneralOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            deny: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        },
                        ...deptRoles.map((role) => ({
                            id: role.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks,
                                PermissionFlagsBits.AddReactions
                            ]
                        })),
                        botAccess
                    ];
                    const deptChat = await ensureNamedText(
                        generalName,
                        generalAliases,
                        category,
                        `${dept.name} department discussion.`,
                        deptGeneralOverwrites
                    );

                    // 5. Task logs (<prefix>-logs) - strictly visible and manageable by department supervisors
                    const logsName = `${prefix}-logs`;
                    const logsAliases = [logsName, `${dept.slug}-logs`, `${prefix}-task-logs`, `${dept.slug}-task-logs`];
                    const supervisorSpecialtiesSet = new Set(dept.supervisorSpecialties);
                    const deptSupervisorRoles = studioRoles
                        .filter(
                            (sr) =>
                                sr.tier <= StudioTier.Executive ||
                                (sr.specialty !== undefined && supervisorSpecialtiesSet.has(sr.specialty))
                        )
                        .map((sr) => roleIds.get(sr.name))
                        .filter((role): role is DiscordRole => role !== undefined);
                    if (supervisorRole !== undefined && !deptSupervisorRoles.some((r) => r.id === supervisorRole.id)) {
                        deptSupervisorRoles.push(supervisorRole);
                    }

                    const deptLogsOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            deny: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        },
                        ...deptSupervisorRoles.map((role) => ({
                            id: role.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageMessages
                            ],
                            deny: [PermissionFlagsBits.SendMessages]
                        })),
                        {
                            id: botId,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.ManageWebhooks
                            ]
                        }
                    ];
                    const deptLogs = await ensureNamedText(
                        logsName,
                        logsAliases,
                        category,
                        `${dept.name} task updates, claims, submissions, and reviews.`,
                        deptLogsOverwrites
                    );
                    const logsRes = await reconcileWebhookOnChannel(deptLogs, `${dept.name} Logs`, botId, false, this.logger);
                    if (logsRes.activeId !== null) {
                        activeWebhookIds.add(logsRes.activeId);
                    }
                    deletedWebhooks.push(...logsRes.deletedNames);
                    const logsWebhookUrl = logsRes.activeUrl;

                    // 6. Voice channel (<dep> general) - department-gated connect
                    const voiceName = `${dept.name} General`;
                    const voiceAliases = [
                        voiceName,
                        `${dept.name} Voice`,
                        `${prefix}-voice`,
                        `${dept.slug}-voice`,
                        `${prefix}-general-voice`,
                        `${dept.name.toLowerCase()} general`
                    ];
                    const deptVoiceOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
                        },
                        ...deptRoles.map((role) => ({
                            id: role.id,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.Connect,
                                PermissionFlagsBits.Speak,
                                PermissionFlagsBits.Stream,
                                PermissionFlagsBits.UseVAD
                            ]
                        })),
                        botAccess
                    ];
                    const deptVoice = await ensureNamedVoice(voiceName, voiceAliases, category, deptVoiceOverwrites);

                    // retain natural channel ordering without altering existing sidebar positions

                    await this.api.bindDepartmentDiscordMap(dept.id, {
                        discordCategoryId: category.id,
                        discordForumId: deptForum.id,
                        discordChatChannelId: deptChat.id,
                        discordInfoChannelId: deptAnnounce.id,
                        discordInfoWebhookUrl: announceWebhookUrl,
                        discordLogsChannelId: deptLogs.id,
                        discordLogsWebhookUrl: logsWebhookUrl,
                        discordApplyChannelId: deptApply.id
                    });
                    await setUpDepartmentDesk(this.api, dept, deptApply, deptLogs.id, guild.roles.cache.values(), this.logger);

                    departmentSummaries.push({
                        departmentName: dept.name,
                        categoryName: category.name,
                        forumName: tasksForumName,
                        channels: [`#${announceName}`, `#${applyName}`, `#${deptChat.name}`, `#${logsName}`, deptVoice.name]
                    });
                }
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to provision department channels");
            }
        }

        const systemWebhooks: Record<string, string> = {};
        if (announcementsWebhookUrl !== null) {
            systemWebhooks.announcements = announcementsWebhookUrl;
        }
        if (prodAnnouncementsWebhookUrl !== null) {
            systemWebhooks[ChannelPurpose.ProductionAnnouncements] = prodAnnouncementsWebhookUrl;
            systemWebhooks["production-announcements"] = prodAnnouncementsWebhookUrl;
        }
        if (taskLogsWebhookUrl !== null) {
            systemWebhooks[ChannelPurpose.TaskLogs] = taskLogsWebhookUrl;
            systemWebhooks["task-logs"] = taskLogsWebhookUrl;
        }
        if (votingLogsWebhookUrl !== null) {
            systemWebhooks[ChannelPurpose.VotingLogs] = votingLogsWebhookUrl;
            systemWebhooks["voting-logs"] = votingLogsWebhookUrl;
        }
        if (userLogsWebhookUrl !== null) {
            systemWebhooks[ChannelPurpose.UserLogs] = userLogsWebhookUrl;
            systemWebhooks["user-logs"] = userLogsWebhookUrl;
        }
        if (securityAlertsWebhookUrl !== null) {
            systemWebhooks.telemetry = securityAlertsWebhookUrl;
            systemWebhooks["telemetry-alerts"] = securityAlertsWebhookUrl;
            systemWebhooks[ChannelPurpose.SecurityAlerts] = securityAlertsWebhookUrl;
            systemWebhooks["security-alerts"] = securityAlertsWebhookUrl;
        }
        if (systemLogsWebhookUrl !== null) {
            systemWebhooks[ChannelPurpose.SystemLogs] = systemLogsWebhookUrl;
            systemWebhooks["system-logs"] = systemLogsWebhookUrl;
        }
        if (modLogsWebhookUrl !== null) {
            systemWebhooks.moderationLogs = modLogsWebhookUrl;
            systemWebhooks["moderation-logs"] = modLogsWebhookUrl;
        }
        if (this.webhooks?.telemetry && !systemWebhooks.telemetry) {
            systemWebhooks.telemetry = this.webhooks.telemetry;
        }
        if (this.webhooks?.securityAlerts && !systemWebhooks.securityAlerts) {
            systemWebhooks.securityAlerts = this.webhooks.securityAlerts;
        }
        if (this.webhooks?.moderationLogs && !systemWebhooks.moderationLogs) {
            systemWebhooks.moderationLogs = this.webhooks.moderationLogs;
        }
        if (this.webhooks?.taskLogs && !systemWebhooks.taskLogs) {
            systemWebhooks.taskLogs = this.webhooks.taskLogs;
        }
        if (this.webhooks?.votingLogs && !systemWebhooks.votingLogs) {
            systemWebhooks.votingLogs = this.webhooks.votingLogs;
        }
        if (this.webhooks?.userLogs && !systemWebhooks.userLogs) {
            systemWebhooks.userLogs = this.webhooks.userLogs;
        }
        if (this.webhooks?.systemLogs && !systemWebhooks.systemLogs) {
            systemWebhooks.systemLogs = this.webhooks.systemLogs;
        }

        await this.settings.update((settings) => {
            delete settings.channels.welcome;
            delete settings.channels.taskSubmissions;
            delete settings.channels.taskForum;
            delete settings.channels.rules;
            delete settings.rulesMessageId;
            if (settings.webhooks) {
                delete settings.webhooks.rules;
            }

            settings.channels[ChannelPurpose.Announcements] = announcements.id;
            settings.channels[ChannelPurpose.ProductionAnnouncements] = prodAnnouncements.id;
            settings.channels[ChannelPurpose.Telemetry] = securityAlerts.id;
            settings.channels[ChannelPurpose.SecurityAlerts] = securityAlerts.id;
            settings.channels[ChannelPurpose.TaskLogs] = taskLogs.id;
            settings.channels[ChannelPurpose.VotingLogs] = votingLogs.id;
            settings.channels[ChannelPurpose.UserLogs] = userLogs.id;
            settings.channels[ChannelPurpose.SystemLogs] = systemLogs.id;
            settings.channels[ChannelPurpose.ModerationLogs] = moderationLogs.id;

            settings.roles[BoundRole.Member] = roleIds.get("Members")?.id;
            settings.roles[BoundRole.Voter] = roleIds.get("Voters")?.id;
            settings.roles[BoundRole.Contributor] = roleIds.get(contributorRoleName)?.id;
            settings.webhooks = systemWebhooks;
        });

        if (this.api !== undefined) {
            await this.api
                .updateDiscordSettings(guild.id, {
                    webhooks: systemWebhooks
                })
                .catch(() => undefined);
        }

        // remove residual guild-wide webhooks not bound to active configuration
        if (typeof guild.fetchWebhooks === "function") {
            try {
                const guildWebhooks = await guild.fetchWebhooks();
                for (const hook of guildWebhooks.values()) {
                    if (activeWebhookIds.has(hook.id)) {
                        continue;
                    }
                    if (typeof hook.delete !== "function") {
                        continue;
                    }
                    const isBotOwned = botId !== undefined && hook.owner?.id === botId;
                    const isStudioNamed = /studio|stairway|grabbox|rules/i.test(hook.name);
                    if (hook.name === "Stairway Tickets") {
                        continue;
                    }
                    if (isBotOwned || isStudioNamed) {
                        await hook.delete("Residual studio webhook cleanup").catch(() => undefined);
                        deletedWebhooks.push(`${hook.name} (orphaned)`);
                    }
                }
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to fetch guild webhooks for residual cleanup");
            }
        }

        return {
            createdRoles,
            createdChannels,
            boundChannels,
            departments: departmentSummaries,
            deletedWebhooks
        };
    }

    public async ensureForumTags(forum: ForumChannel, isDefaultTaskForum = true): Promise<ForumChannel> {
        const missing = Object.values(ShotStatus).filter(
            (status) => !forum.availableTags.some((tag) => tag.name === forumTagNames[status])
        );
        const updated =
            missing.length === 0
                ? forum
                : await forum.setAvailableTags(
                      [...forum.availableTags, ...missing.map((status) => ({ name: forumTagNames[status], moderated: true }))],
                      "Task status tags"
                  );
        if (isDefaultTaskForum) {
            await this.settings.update((settings) => {
                for (const status of Object.values(ShotStatus)) {
                    const tag = updated.availableTags.find((candidate) => candidate.name === forumTagNames[status]);
                    if (tag !== undefined) {
                        settings.forumTags[status] = tag.id;
                    }
                }
            });
        }
        return updated;
    }

    public async ensureForumPermissions(
        forum: ForumChannel,
        deptRolesOrIsExisting: readonly DiscordRole[] | boolean = false
    ): Promise<void> {
        const guild = forum.guild;
        const botId = guild.client.user.id;
        if (deptRolesOrIsExisting === true) {
            // preserve existing permissions and only ensure bot access
            await forum.permissionOverwrites
                .create(
                    botId,
                    {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: true,
                        SendMessagesInThreads: true,
                        CreatePublicThreads: true,
                        ManageThreads: true
                    },
                    { reason: "Configure bot task forum permissions" }
                )
                .catch(() => undefined);
            return;
        }

        const everyone = guild.roles.everyone.id;
        const existingRoles = await guild.roles.fetch();
        const staffRoles = studioRoles
            .filter((role) => role.tier <= StudioTier.Department)
            .map((def) => existingRoles.find((role) => findStudioRole(role.name)?.name === def.name))
            .filter((role): role is DiscordRole => role !== undefined);

        const deptRoles = typeof deptRolesOrIsExisting !== "boolean" ? deptRolesOrIsExisting : undefined;
        const allowedRoles: readonly DiscordRole[] =
            deptRoles !== undefined && deptRoles.length > 0
                ? deptRoles
                : studioRoles
                      .filter((role) => role.tier === StudioTier.Contributor)
                      .map((def) => existingRoles.find((role) => findStudioRole(role.name)?.name === def.name))
                      .filter((role): role is DiscordRole => role !== undefined);

        const overwrites: { id: string; options: PermissionOverwriteOptions }[] = [
            {
                id: everyone,
                options: {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessagesInThreads: false,
                    UseApplicationCommands: false,
                    SendMessages: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false
                }
            },
            ...allowedRoles.map((role) => ({
                id: role.id,
                options: {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessagesInThreads: true,
                    UseApplicationCommands: true,
                    AttachFiles: true,
                    EmbedLinks: true
                }
            })),
            ...staffRoles.map((role) => ({
                id: role.id,
                options: {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessages: true,
                    SendMessagesInThreads: true,
                    CreatePublicThreads: true,
                    ManageThreads: true
                }
            })),
            {
                id: botId,
                options: {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessages: true,
                    SendMessagesInThreads: true,
                    CreatePublicThreads: true,
                    ManageThreads: true
                }
            }
        ];

        // apply role overwrites without wiping existing custom overwrites
        for (const item of overwrites) {
            await forum.permissionOverwrites
                .create(item.id, item.options, { reason: "Configure task forum permissions" })
                .catch(() => undefined);
        }
    }

    public async enforceRoleHierarchy(guild: Guild): Promise<number> {
        const guildRoles = await guild.roles.fetch();
        const roleList: (DiscordRole | null)[] = Array.from(guildRoles.values());
        const positions: { role: string; position: number }[] = [];

        let position = 1;
        const reversed = [...studioRoles].reverse();
        for (const definition of reversed) {
            const match = roleList.find(
                (role) => role !== null && role !== undefined && findStudioRole(role.name)?.name === definition.name
            );
            if (match !== undefined && match !== null) {
                positions.push({ role: match.id, position });
                position++;
            }
        }
        if (positions.length > 0 && typeof guild.roles.setPositions === "function") {
            await guild.roles.setPositions(positions).catch((err: unknown) => {
                this.logger.warn({ err }, "failed to set role hierarchy positions");
            });
        }
        return positions.length;
    }
}
