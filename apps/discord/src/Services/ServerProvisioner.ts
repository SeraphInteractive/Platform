import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DepartmentSlug, DocumentSlug, ShotStatus } from "@platform/contracts";
import {
    ChannelType,
    PermissionFlagsBits,
    WebhookClient,
    type CategoryChannel,
    type ForumChannel,
    type Guild,
    type GuildBasedChannel,
    type OverwriteResolvable,
    type Role as DiscordRole,
    type TextChannel,
    type VoiceChannel
} from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { message, panel, plain } from "../Discord/Ui.js";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { htmlToDiscordMarkdown } from "../Views/NotificationViews.js";
import { contributorRoleName, findStudioRole, normalizeName, permissionsForRole, studioRoles, StudioTier } from "./StudioRoles.js";

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

function loadBotAvatar(): Buffer | undefined {
    const candidates = [
        join(process.cwd(), "assets", "bot-pfp-temp.png"),
        join(process.cwd(), "apps", "discord", "assets", "bot-pfp-temp.png"),
        join(process.cwd(), "apps", "web", "public", "branding", "bot-pfp-temp.png"),
        "/home/yierke/mnt/extra/BACKUP!!!/Videos/bot-pfp.png"
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            try {
                return readFileSync(candidate);
            } catch {
                // ignore unreadable avatar file
            }
        }
    }
    return undefined;
}

const botAvatarBuffer = loadBotAvatar();

async function ensureWebhookOnChannel(
    channel: TextChannel,
    name: string,
    logger: Logger,
    avatar: Buffer | undefined = botAvatarBuffer
): Promise<string | null> {
    try {
        const webhooks = await channel.fetchWebhooks();
        const existing = webhooks.find((hook) => hook.name.toLowerCase() === name.toLowerCase());
        if (existing?.url) {
            return existing.url;
        }
        const created = await channel.createWebhook({
            name,
            avatar,
            reason: "Studio department webhook setup"
        });
        return created.url;
    } catch (err: unknown) {
        logger.warn({ err, channel: channel.name }, `failed to ensure webhook ${name}`);
        return null;
    }
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
}

export interface ServerProvisionerWebhooks {
    readonly telemetry?: string;
    readonly moderationLogs?: string;
    readonly rules?: string;
}

export const forumTagNames: Readonly<Record<ShotStatus, string>> = {
    [ShotStatus.Available]: "Available",
    [ShotStatus.Claimed]: "Claimed",
    [ShotStatus.Submitted]: "Submitted",
    [ShotStatus.Approved]: "Approved"
};

type SystemChannelPurpose = ChannelPurpose.Rules | ChannelPurpose.Announcements | ChannelPurpose.Telemetry | ChannelPurpose.ModerationLogs;

const channelNames: Readonly<Record<SystemChannelPurpose, string>> = {
    [ChannelPurpose.Rules]: "rules",
    [ChannelPurpose.Announcements]: "announcements",
    [ChannelPurpose.Telemetry]: "telemetry-alerts",
    [ChannelPurpose.ModerationLogs]: "moderation-logs"
};

const channelAliases: Readonly<Record<SystemChannelPurpose, readonly string[]>> = {
    [ChannelPurpose.Rules]: ["rules", "studio-rules", "guidelines", "rules-and-guidelines"],
    [ChannelPurpose.Announcements]: ["announcements", "announcement", "studio-announcements"],
    [ChannelPurpose.Telemetry]: ["telemetry-alerts", "telemetry", "bot-alerts", "alerts"],
    [ChannelPurpose.ModerationLogs]: ["moderation-logs", "mod-logs", "supervisor-logs", "mod-log"]
};

export function renderDocumentMarkdown(title: string, revision: number, sections: readonly { title: string; html: string }[]): string {
    const lines: string[] = [`# ${plain(title)}`, "*Official community standards and pipeline etiquette.*", ""];
    for (const section of sections) {
        lines.push(`### ${section.title}`);
        lines.push("");
        lines.push(htmlToDiscordMarkdown(section.html));
        lines.push("");
    }
    lines.push(`-# Revision ${revision} - Project Stairway Studio`);
    return lines.join("\n").trim();
}

export const studioRules = [
    "# Project Stairway - Discord Rules",
    "*Official community standards and pipeline etiquette.*",
    "",
    "### 1. Conduct",
    "",
    "- **Respect and Zero Tolerance:** Harassment, hate speech, slurs, doxxing, or personal attacks result in immediate removal.",
    "",
    "- **PG-13 Standard:** Explicit, NSFW, gore, or disruptive media is strictly prohibited.",
    "",
    "- **No Spam or Promotion:** Unsolicited commercial advertising, DM self-promotion, and link spam are not allowed.",
    "",
    "- **Channel Discipline:** Keep discussions on-topic in designated department channels and production threads.",
    "",
    "### 2. Moderation",
    "",
    "- **Automated Inspection:** AutoMod actively deletes profanity, slurs, and obfuscated text variations across all channels.",
    "",
    "- **Progressive Discipline:**\n- 1st Offence (5 warnings): 24-hour mute.\n- 2nd Offence (+3 warnings): 1-week mute.\n- 3rd Offence (+1 warning): 1-month server ban.",
    "",
    "- **Decay and Logs:** Infraction warnings decay after 30 days. All moderation actions are logged to staff channels.",
    "",
    "- **Ban Apology Review:** Banned members can submit `/ban-apology` in direct messages with the bot for supervisor review.",
    "",
    "### 3. Permissions",
    "",
    "- **Base Members:** Text-only access in public channels. File uploads, link embeds, and external emojis are restricted to prevent raids and spam.",
    "",
    "- **Verified Voters:** Authenticated community members unlock file attachments, image uploads, link embeds, and external reactions.",
    "",
    "- **Contributors:** Unlocks thread creation and active participation in task review discussions.",
    "",
    "### 4. Grab-Box",
    "",
    "- **Single Active Claim:** Contributors may hold only one active production task claim at a time.",
    "",
    "- **Deadlines and Release:** Complete tasks within the allocated timeframe. If unable to finish, release the task promptly with `/release-task`.",
    "",
    "- **Submission Standards:** Submissions must include packed, organized `.blend` files alongside compressed viewport preview video (`MP4`/`WebM`).",
    "",
    "- **Supervisor QA:** Deliverables must pass department supervisor review before merging into the master film timeline.",
    "",
    "### 5. Charter & Links",
    "",
    "- **Contributor Ownership:** You retain ownership of original work while granting the studio a perpetual license for film production and release.",
    "",
    "- **Guidelines and Studio Charter:** [https://projectstairway.net/guidelines](https://projectstairway.net/guidelines)",
    "",
    "- **Terms of Service:** [https://projectstairway.net/legal/terms](https://projectstairway.net/legal/terms)",
    "",
    "- **Grab-Box Pipeline:** [https://projectstairway.net/grabbox](https://projectstairway.net/grabbox)",
    "",
    "- **Platform Dashboard:** [https://projectstairway.net](https://projectstairway.net)",
    "",
    "-# Revision 1 - Project Stairway Studio"
].join("\n");

export class ServerProvisioner {
    public constructor(
        private readonly settings: SettingsStore,
        private readonly logger: Logger,
        private readonly announcementsChannelId?: string,
        private readonly api?: PlatformApiClient,
        private readonly webhooks?: ServerProvisionerWebhooks
    ) {}

    public async bindExisting(guild: Guild): Promise<void> {
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
            for (const purpose of Object.keys(channelAliases) as SystemChannelPurpose[]) {
                const aliases = channelAliases[purpose];
                const match = channels.find((channel) => {
                    if (channel === null || channel.type !== ChannelType.GuildText) {
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
                    const grabboxName = departmentGrabBoxName[dept.slug] ?? `${prefix}-grabbox`;
                    const forumAliases = [
                        grabboxName,
                        `${dept.name}-GrabBox`,
                        `${dept.slug}-grabbox`,
                        `${prefix}-grabbox`,
                        "lighting-vfx-grabbox",
                        "art-and-writing-grabbox",
                        `${prefix}-tasks`,
                        `${dept.slug}-tasks`
                    ];
                    const deptForum = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildForum &&
                            forumAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    );
                    const chatAliases = [`${prefix}-general`, dept.slug, `${prefix}-chat`, `${dept.slug}-chat`];
                    const deptChat = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildText &&
                            chatAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    const infoAliases = [`${prefix}-info`, `${dept.slug}-info`, `${prefix}-announcements`, `${dept.slug}-announcements`];
                    const deptInfo = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildText &&
                            infoAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    const logsAliases = [`${prefix}-logs`, `${dept.slug}-logs`, `${prefix}-task-logs`, `${dept.slug}-task-logs`];
                    const deptLogs = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildText &&
                            logsAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    const applyAliases = [`${prefix}-apply`, `${dept.slug}-apply`, `${prefix}-tickets`, `${dept.slug}-tickets`];
                    const deptApply = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildText &&
                            applyAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as TextChannel | undefined;

                    if (category !== undefined && category !== null && deptForum !== undefined && deptForum !== null) {
                        let infoWebhookUrl = dept.discordInfoWebhookUrl ?? null;
                        if (!infoWebhookUrl && deptInfo) {
                            infoWebhookUrl = await ensureWebhookOnChannel(deptInfo, `${dept.name} Info`, this.logger);
                        }
                        let logsWebhookUrl = dept.discordLogsWebhookUrl ?? null;
                        if (!logsWebhookUrl && deptLogs) {
                            logsWebhookUrl = await ensureWebhookOnChannel(deptLogs, `${dept.name} Logs`, this.logger);
                        }

                        await this.api.bindDepartmentDiscordMap(dept.id, {
                            discordCategoryId: category.id,
                            discordForumId: deptForum.id,
                            discordChatChannelId: deptChat?.id ?? null,
                            discordInfoChannelId: deptInfo?.id ?? null,
                            discordInfoWebhookUrl: infoWebhookUrl,
                            discordLogsChannelId: deptLogs?.id ?? null,
                            discordLogsWebhookUrl: logsWebhookUrl,
                            discordApplyChannelId: deptApply?.id ?? null
                        });

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

        const ensureCategory = async (name: string, overwrites: OverwriteResolvable[]): Promise<CategoryChannel> => {
            const existing = find(name, ChannelType.GuildCategory);
            if (existing?.type === ChannelType.GuildCategory) {
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
                if (channel === null || channel.type !== ChannelType.GuildText) {
                    return false;
                }
                const normalized = normalizeName(channel.name);
                return aliases.some((alias) => normalizeName(alias) === normalized);
            }) as TextChannel | undefined;

            if (existing !== undefined) {
                boundChannels.push(`#${existing.name}`);
                await existing.permissionOverwrites
                    .create(
                        botId,
                        {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        },
                        { reason: "Ensure bot access to bound channel" }
                    )
                    .catch(() => undefined);
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
                if (channel === null || channel.type !== ChannelType.GuildVoice) {
                    return false;
                }
                const normalized = normalizeName(channel.name);
                return aliases.some((alias) => normalizeName(alias) === normalized);
            }) as VoiceChannel | undefined;

            if (existing !== undefined) {
                boundChannels.push(existing.name);
                await existing.permissionOverwrites
                    .create(
                        botId,
                        {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true
                        },
                        { reason: "Ensure bot access to bound voice channel" }
                    )
                    .catch(() => undefined);
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
                await channelById.permissionOverwrites
                    .create(
                        botId,
                        {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        },
                        { reason: "Ensure bot access to bound channel" }
                    )
                    .catch(() => undefined);
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

        // clean up legacy global task pipeline channels if present
        const legacyForumId = this.settings.channel(ChannelPurpose.TaskForum);
        const legacyTasksForums = channels.filter(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildForum &&
                (channel.id === legacyForumId || normalizeName(channel.name) === "tasks" || normalizeName(channel.name) === "taskpipeline")
        );
        for (const [, forumCh] of legacyTasksForums) {
            if (forumCh !== null) {
                await forumCh.delete("Remove legacy global task forum").catch(() => undefined);
                channels.delete(forumCh.id);
            }
        }

        const legacySubmissionsId = this.settings.channel(ChannelPurpose.TaskSubmissions);
        const legacySubmissionChannels = channels.filter(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildText &&
                (channel.id === legacySubmissionsId ||
                    normalizeName(channel.name) === "tasksubmissions" ||
                    normalizeName(channel.name) === "submissions")
        );
        for (const [, subCh] of legacySubmissionChannels) {
            if (subCh !== null) {
                await subCh.delete("Remove legacy task submissions channel").catch(() => undefined);
                channels.delete(subCh.id);
            }
        }

        const legacyPipelineCategory = channels.find(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildCategory &&
                normalizeName(channel.name) === normalizeName("Task pipeline")
        );
        if (legacyPipelineCategory !== undefined && legacyPipelineCategory !== null) {
            await legacyPipelineCategory.delete("Remove legacy task pipeline category").catch(() => undefined);
            channels.delete(legacyPipelineCategory.id);
        }

        const platform = await ensureCategory("Platform", []);
        const staff = await ensureCategory("Staff", privateOverwrites);

        const announcements = await ensureText(
            ChannelPurpose.Announcements,
            platform,
            "Round results and studio news.",
            readOnlyOverwrites
        );

        const announcementsWebhookUrl = await ensureWebhookOnChannel(announcements, "Studio Announcements", this.logger);
        if (announcementsWebhookUrl !== null && this.api !== undefined) {
            await this.api
                .updateDiscordSettings(guild.id, {
                    webhooks: {
                        announcements: announcementsWebhookUrl
                    }
                })
                .catch(() => undefined);
        }

        const rules = await ensureText(
            ChannelPurpose.Rules,
            platform,
            "Community guidelines, voting invariants, and rules.",
            readOnlyOverwrites
        );

        // telemetry channel (skip creating if webhook URL configured and channel not found)
        const telemetryExisting = channels.find(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildText &&
                channelAliases[ChannelPurpose.Telemetry].some((alias) => normalizeName(alias) === normalizeName(channel.name))
        ) as TextChannel | undefined;
        const telemetry =
            this.webhooks?.telemetry !== undefined && telemetryExisting === undefined
                ? undefined
                : await ensureText(ChannelPurpose.Telemetry, staff, "Voting activity, bans and raid alerts.", privateOverwrites);

        // moderation logs channel (skip creating if webhook URL configured and channel not found)
        const modLogsExisting = channels.find(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildText &&
                channelAliases[ChannelPurpose.ModerationLogs].some((alias) => normalizeName(alias) === normalizeName(channel.name))
        ) as TextChannel | undefined;
        const moderationLogs =
            this.webhooks?.moderationLogs !== undefined && modLogsExisting === undefined
                ? undefined
                : await ensureText(
                      ChannelPurpose.ModerationLogs,
                      staff,
                      "Profanity warnings, timeouts, and AutoMod incident logs.",
                      privateOverwrites
                  );

        const contributorRoles = studioRoles
            .filter((role) => role.tier <= StudioTier.Contributor)
            .map((role) => roleIds.get(role.name))
            .filter((role): role is DiscordRole => role !== undefined);

        const production = await ensureCategory("Production", []);

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

        const productionManagementOverwrites: OverwriteResolvable[] = [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...staffRoles.map((role) => ({
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

                    // 1. Info channel (<prefix>-info)
                    const infoName = `${prefix}-info`;
                    const infoAliases = [infoName, `${dept.slug}-info`, `${prefix}-announcements`, `${dept.slug}-announcements`];
                    const deptInfoOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        },
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
                    const deptInfo = await ensureNamedText(
                        infoName,
                        infoAliases,
                        category,
                        `${dept.name} department announcements and guidelines.`,
                        deptInfoOverwrites
                    );
                    const infoWebhookUrl = await ensureWebhookOnChannel(deptInfo, `${dept.name} Info`, this.logger);

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
                    const forumAliases = [
                        tasksForumName,
                        `${dept.name}-GrabBox`,
                        `${dept.slug}-grabbox`,
                        `${prefix}-grabbox`,
                        "lighting-vfx-grabbox",
                        "art-and-writing-grabbox",
                        `${prefix}-tasks`,
                        `${dept.slug}-tasks`
                    ];
                    let deptForum = channels.find(
                        (channel) =>
                            channel !== null &&
                            channel.type === ChannelType.GuildForum &&
                            forumAliases.some((alias) => normalizeName(alias) === normalizeName(channel.name))
                    ) as ForumChannel | undefined;
                    const isExistingDeptForum = deptForum !== undefined;
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
                    await this.ensureForumPermissions(deptForum, isExistingDeptForum);
                    await this.ensureForumTags(deptForum, true);

                    // 4. General discussion (<prefix>-general) - department-gated chat
                    const generalName = `${prefix}-general`;
                    const generalAliases = [generalName, dept.slug, `${prefix}-chat`, `${dept.slug}-chat`];

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

                    const deptGeneralOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AddReactions
                            ],
                            deny: [
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

                    // 5. Task logs (<prefix>-logs)
                    const logsName = `${prefix}-logs`;
                    const logsAliases = [logsName, `${dept.slug}-logs`, `${prefix}-task-logs`, `${dept.slug}-task-logs`];
                    const deptLogsOverwrites: OverwriteResolvable[] = [
                        {
                            id: everyone,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.CreatePublicThreads,
                                PermissionFlagsBits.CreatePrivateThreads
                            ]
                        },
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
                    const deptLogs = await ensureNamedText(
                        logsName,
                        logsAliases,
                        category,
                        `${dept.name} task updates, claims, submissions, and reviews.`,
                        deptLogsOverwrites
                    );
                    const logsWebhookUrl = await ensureWebhookOnChannel(deptLogs, `${dept.name} Logs`, this.logger);

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
                            allow: [PermissionFlagsBits.ViewChannel],
                            deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
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

                    // enforce requested department channel hierarchy within the category:
                    // 1. <prefix>-info (0)
                    // 2. <prefix>-apply (1)
                    // 3. <dept>-grabbox (2)
                    // 4. <prefix>-general (3)
                    // 5. <prefix>-logs (4)
                    // 6. <dep> General (5) [Voice]
                    const orderedChannels = [deptInfo, deptApply, deptForum, deptChat, deptLogs, deptVoice];
                    for (const [index, ch] of orderedChannels.entries()) {
                        if (ch.parentId === category.id || !ch.parentId) {
                            await ch.setPosition(index).catch(() => undefined);
                        }
                    }

                    await this.api.bindDepartmentDiscordMap(dept.id, {
                        discordCategoryId: category.id,
                        discordForumId: deptForum.id,
                        discordChatChannelId: deptChat.id,
                        discordInfoChannelId: deptInfo.id,
                        discordInfoWebhookUrl: infoWebhookUrl,
                        discordLogsChannelId: deptLogs.id,
                        discordLogsWebhookUrl: logsWebhookUrl,
                        discordApplyChannelId: deptApply.id
                    });

                    departmentSummaries.push({
                        departmentName: dept.name,
                        categoryName: category.name,
                        forumName: tasksForumName,
                        channels: [`#${infoName}`, `#${applyName}`, tasksForumName, `#${deptChat.name}`, `#${logsName}`, deptVoice.name]
                    });
                }
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to provision department channels");
            }
        }

        let rulesContent = studioRules;
        if (this.api !== undefined) {
            try {
                const doc = await this.api.getDocument(DocumentSlug.Rules);
                if (doc !== null && doc.sections.length > 0) {
                    rulesContent = renderDocumentMarkdown(doc.title, doc.revision, doc.sections);
                }
            } catch {
                // fall back to default rules content
            }
        }
        const rulesPayload = message(panel(null, rulesContent));

        if (this.webhooks?.rules !== undefined) {
            try {
                const webhook = new WebhookClient({ url: this.webhooks.rules });
                const existingId = this.settings.rulesMessageId;
                let edited = false;
                if (existingId !== undefined) {
                    try {
                        await webhook.editMessage(existingId, {
                            flags: rulesPayload.flags,
                            components: rulesPayload.components,
                            allowedMentions: rulesPayload.allowedMentions
                        });
                        edited = true;
                    } catch {
                        // ignore and post fresh message
                    }
                }
                if (!edited) {
                    const posted = await webhook.send({
                        flags: rulesPayload.flags,
                        components: rulesPayload.components,
                        allowedMentions: rulesPayload.allowedMentions
                    });
                    await this.settings.update((settings) => {
                        settings.rulesMessageId = posted.id;
                    });
                    await rules.messages.pin(posted.id).catch(() => undefined);
                }
            } catch (err: unknown) {
                this.logger.warn({ err }, "failed to publish rules via webhook during setup");
            }
        } else {
            const pins = await rules.messages.fetchPinned().catch(() => null);
            const botRulesMessage = pins?.find((msg) => msg.author.id === botId);
            if (botRulesMessage !== undefined) {
                await botRulesMessage.edit(rulesPayload).catch(() => undefined);
            } else {
                const posted = await rules.send(rulesPayload);
                await posted.pin().catch(() => undefined);
            }
        }

        await this.settings.update((settings) => {
            delete settings.channels.welcome;
            delete settings.channels.taskSubmissions;
            delete settings.channels.taskForum;

            settings.channels[ChannelPurpose.Rules] = rules.id;
            settings.channels[ChannelPurpose.Announcements] = announcements.id;
            if (telemetry !== undefined) {
                settings.channels[ChannelPurpose.Telemetry] = telemetry.id;
            }
            if (moderationLogs !== undefined) {
                settings.channels[ChannelPurpose.ModerationLogs] = moderationLogs.id;
            }
            settings.roles[BoundRole.Voter] = roleIds.get("Voters")?.id;
            settings.roles[BoundRole.Contributor] = roleIds.get(contributorRoleName)?.id;
        });

        return { createdRoles, createdChannels, boundChannels, departments: departmentSummaries };
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

    public async ensureForumPermissions(forum: ForumChannel, isExisting = false): Promise<void> {
        const guild = forum.guild;
        const botId = guild.client.user.id;
        if (isExisting) {
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
        const contributorRoles = studioRoles
            .filter((role) => role.tier === StudioTier.Contributor)
            .map((def) => existingRoles.find((role) => findStudioRole(role.name)?.name === def.name))
            .filter((role): role is DiscordRole => role !== undefined);

        // allow thread replies while locking root creation to staff
        await forum.permissionOverwrites.set(
            [
                {
                    id: everyone,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.SendMessagesInThreads,
                        PermissionFlagsBits.UseApplicationCommands
                    ],
                    deny: [
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.CreatePublicThreads,
                        PermissionFlagsBits.CreatePrivateThreads
                    ]
                },
                ...contributorRoles.map((role) => ({
                    id: role.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.SendMessagesInThreads,
                        PermissionFlagsBits.UseApplicationCommands,
                        PermissionFlagsBits.AttachFiles
                    ]
                })),
                ...staffRoles.map((role) => ({
                    id: role.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.SendMessagesInThreads,
                        PermissionFlagsBits.CreatePublicThreads,
                        PermissionFlagsBits.ManageThreads
                    ]
                })),
                {
                    id: botId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.SendMessagesInThreads,
                        PermissionFlagsBits.CreatePublicThreads,
                        PermissionFlagsBits.ManageThreads
                    ]
                }
            ],
            "Configure task forum permissions"
        );
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
        if (positions.length > 0) {
            await guild.roles.setPositions(positions).catch((err: unknown) => {
                this.logger.warn({ err }, "failed to set role hierarchy positions");
            });
        }
        return positions.length;
    }
}
