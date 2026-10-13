import { DocumentSlug, ShotStatus } from "@platform/contracts";
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
    type TextChannel
} from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import { message, panel, plain } from "../Discord/Ui.js";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { htmlToDiscordMarkdown } from "../Views/NotificationViews.js";
import { contributorRoleName, findStudioRole, normalizeName, permissionsForRole, studioRoles, StudioTier } from "./StudioRoles.js";

export interface ProvisionSummary {
    readonly createdRoles: readonly string[];
    readonly createdChannels: readonly string[];
    readonly boundChannels: readonly string[];
}

export interface ServerProvisionerWebhooks {
    readonly announcements?: string;
    readonly telemetry?: string;
    readonly taskLogs?: string;
    readonly moderationLogs?: string;
    readonly rules?: string;
}

const forumTagNames: Readonly<Record<ShotStatus, string>> = {
    [ShotStatus.Available]: "Available",
    [ShotStatus.Claimed]: "Claimed",
    [ShotStatus.Submitted]: "Submitted",
    [ShotStatus.Approved]: "Approved"
};

const channelNames: Readonly<Record<Exclude<ChannelPurpose, ChannelPurpose.TaskForum>, string>> = {
    [ChannelPurpose.Welcome]: "welcome",
    [ChannelPurpose.Rules]: "rules",
    [ChannelPurpose.Announcements]: "announcements",
    [ChannelPurpose.Telemetry]: "telemetry-alerts",
    [ChannelPurpose.TaskSubmissions]: "task-submissions",
    [ChannelPurpose.TaskLogs]: "task-logs",
    [ChannelPurpose.ModerationLogs]: "moderation-logs"
};

const channelAliases: Readonly<Record<Exclude<ChannelPurpose, ChannelPurpose.TaskForum>, readonly string[]>> = {
    [ChannelPurpose.Welcome]: ["welcome", "welcome-and-rules", "arrivals", "general-welcome"],
    [ChannelPurpose.Rules]: ["rules", "studio-rules", "guidelines", "rules-and-guidelines"],
    [ChannelPurpose.Announcements]: ["announcements", "announcement", "studio-announcements"],
    [ChannelPurpose.Telemetry]: ["telemetry-alerts", "telemetry", "bot-alerts", "alerts"],
    [ChannelPurpose.TaskSubmissions]: ["task-submissions", "submissions", "deliverables"],
    [ChannelPurpose.TaskLogs]: ["task-logs", "task-log", "logs"],
    [ChannelPurpose.ModerationLogs]: ["moderation-logs", "mod-logs", "supervisor-logs", "mod-log"]
};

const forumName = "tasks";

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
            const member = roles.find((role) => findStudioRole(role.name)?.name === "Members");
            const voter = roles.find((role) => findStudioRole(role.name)?.name === "Voters");
            const contributor = roles.find((role) => findStudioRole(role.name)?.name === contributorRoleName);
            settings.roles[BoundRole.Member] ??= member?.id;
            settings.roles[BoundRole.Voter] ??= voter?.id;
            settings.roles[BoundRole.Contributor] ??= contributor?.id;
            for (const purpose of Object.keys(channelAliases) as Exclude<ChannelPurpose, ChannelPurpose.TaskForum>[]) {
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
            const forum = channels.find(
                (channel) => channel !== null && channel.type === ChannelType.GuildForum && normalizeName(channel.name) === forumName
            );
            if (forum?.type === ChannelType.GuildForum) {
                settings.channels[ChannelPurpose.TaskForum] ??= forum.id;
                for (const status of Object.values(ShotStatus)) {
                    settings.forumTags[status] ??= forum.availableTags.find((tag) => tag.name === forumTagNames[status])?.id;
                }
            }
        });
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
        const contributorRoles = studioRoles
            .filter((role) => role.tier === StudioTier.Contributor)
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

        const ensureText = async (
            purpose: Exclude<ChannelPurpose, ChannelPurpose.TaskForum>,
            parent: CategoryChannel,
            topic: string,
            overwrites: OverwriteResolvable[]
        ): Promise<TextChannel> => {
            const name = channelNames[purpose];
            const aliases = channelAliases[purpose];
            const configuredId = this.settings.channel(purpose);
            const channelById = configuredId !== undefined ? channels.get(configuredId) : undefined;
            const existing =
                (channelById?.type === ChannelType.GuildText ? channelById : undefined) ??
                (channels.find((channel) => {
                    if (channel === null || channel.type !== ChannelType.GuildText) {
                        return false;
                    }
                    const normalized = normalizeName(channel.name);
                    return aliases.some((alias) => normalizeName(alias) === normalized);
                }) as TextChannel | undefined);

            if (existing !== undefined) {
                boundChannels.push(`#${existing.name}`);
                // ensure bot has basic access without modifying category hierarchy or overwriting existing permissions
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

        const platform = await ensureCategory("Platform", []);
        const pipeline = await ensureCategory("Task pipeline", []);
        const staff = await ensureCategory("Staff", privateOverwrites);

        const welcome = await ensureText(
            ChannelPurpose.Welcome,
            platform,
            "Welcome to the studio! Member arrivals and onboarding.",
            readOnlyOverwrites
        );

        const announcements = await ensureText(
            ChannelPurpose.Announcements,
            platform,
            "Round results and studio news.",
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

        const submissions = await ensureText(ChannelPurpose.TaskSubmissions, pipeline, "Deliverables waiting for review.", [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...staffRead,
            ...contributorRoles.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
            botAccess
        ]);

        // task logs channel (skip creating if webhook URL configured and channel not found)
        const taskLogsExisting = channels.find(
            (channel) =>
                channel !== null &&
                channel.type === ChannelType.GuildText &&
                channelAliases[ChannelPurpose.TaskLogs].some((alias) => normalizeName(alias) === normalizeName(channel.name))
        ) as TextChannel | undefined;
        const logs =
            this.webhooks?.taskLogs !== undefined && taskLogsExisting === undefined
                ? undefined
                : await ensureText(ChannelPurpose.TaskLogs, staff, "Task activity log.", privateOverwrites);

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

        const rules = await ensureText(
            ChannelPurpose.Rules,
            platform,
            "Community guidelines, voting invariants, and rules.",
            readOnlyOverwrites
        );

        let forum = find(forumName, ChannelType.GuildForum) as ForumChannel | undefined;
        const isExistingForum = forum !== undefined;
        if (forum === undefined) {
            forum = await guild.channels.create({
                name: forumName,
                type: ChannelType.GuildForum,
                parent: pipeline.id,
                topic: "Open tasks. Use /take-task in a post to claim it.",
                reason: "Studio setup"
            });
            createdChannels.push(forumName);
        } else {
            boundChannels.push(forum.name);
        }
        await this.ensureForumPermissions(forum, isExistingForum);
        const tagged = await this.ensureForumTags(forum);

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
            if (welcome !== undefined) {
                settings.channels[ChannelPurpose.Welcome] = welcome.id;
            }
            settings.channels[ChannelPurpose.Rules] = rules.id;
            settings.channels[ChannelPurpose.Announcements] = announcements.id;
            if (telemetry !== undefined) {
                settings.channels[ChannelPurpose.Telemetry] = telemetry.id;
            }
            settings.channels[ChannelPurpose.TaskSubmissions] = submissions.id;
            if (logs !== undefined) {
                settings.channels[ChannelPurpose.TaskLogs] = logs.id;
            }
            if (moderationLogs !== undefined) {
                settings.channels[ChannelPurpose.ModerationLogs] = moderationLogs.id;
            }
            settings.channels[ChannelPurpose.TaskForum] = tagged.id;
            settings.roles[BoundRole.Voter] = roleIds.get("Voters")?.id;
            settings.roles[BoundRole.Contributor] = roleIds.get(contributorRoleName)?.id;
        });

        return { createdRoles, createdChannels, boundChannels };
    }

    public async ensureForumTags(forum: ForumChannel): Promise<ForumChannel> {
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
        await this.settings.update((settings) => {
            settings.channels[ChannelPurpose.TaskForum] = updated.id;
            for (const status of Object.values(ShotStatus)) {
                const tag = updated.availableTags.find((candidate) => candidate.name === forumTagNames[status]);
                if (tag !== undefined) {
                    settings.forumTags[status] = tag.id;
                }
            }
        });
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
