import { ShotStatus } from "@platform/contracts";
import {
    ChannelType,
    PermissionFlagsBits,
    type CategoryChannel,
    type ForumChannel,
    type Guild,
    type GuildBasedChannel,
    type OverwriteResolvable,
    type Role as DiscordRole,
    type TextChannel
} from "discord.js";
import type { Logger } from "pino";
import { message, panel } from "../Discord/Ui.js";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { contributorRoleName, findStudioRole, normalizeName, permissionsFor, studioRoles, StudioTier } from "./StudioRoles.js";

export interface ProvisionSummary {
    readonly createdRoles: readonly string[];
    readonly createdChannels: readonly string[];
    readonly boundChannels: readonly string[];
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
    [ChannelPurpose.TaskLogs]: "task-logs"
};

const channelAliases: Readonly<Record<Exclude<ChannelPurpose, ChannelPurpose.TaskForum>, readonly string[]>> = {
    [ChannelPurpose.Welcome]: ["welcome", "welcome-and-rules", "arrivals", "general-welcome"],
    [ChannelPurpose.Rules]: ["rules", "studio-rules", "guidelines", "rules-and-guidelines"],
    [ChannelPurpose.Announcements]: ["announcements", "announcement", "studio-announcements"],
    [ChannelPurpose.Telemetry]: ["telemetry-alerts", "telemetry", "bot-alerts", "alerts"],
    [ChannelPurpose.TaskSubmissions]: ["task-submissions", "submissions", "deliverables"],
    [ChannelPurpose.TaskLogs]: ["task-logs", "task-log", "logs"]
};

const forumName = "tasks";

export const studioRules = [
    "# 📜 Project Stairway — Discord Rules",
    "*Official community standards and pipeline etiquette.*",
    "",
    "### 1. Community & Chat Rules",
    "• **Respect Everyone:** Treat all community members, contributors, supervisors, and directors with respect. Harassment, discrimination, hate speech, and toxicity result in an immediate ban.",
    "• **Channel Discipline:** Keep conversations on-topic within designated channels and threads.",
    "• **No Spam or Self-Promotion:** Commercial advertising, unsolicited direct messages, and spam are strictly prohibited.",
    "• **Appropriate Content:** Maintain a PG-13 environment. NSFW, gore, or disruptive content is forbidden.",
    "",
    "### 2. Production & Grab-Box Etiquette",
    "• **Honor Claim Timelines:** Claim tasks only when you have bandwidth to complete them. If unable to finish, release the task promptly with `/release-task`.",
    "• **Deliverable Quality:** Provide organized `.blend` files alongside compressed viewport renders according to department standards.",
    "• **Constructive Reviews:** Keep discussion in task review threads objective, polite, and focused on QA criteria.",
    "",
    "### 3. Studio Charter & Full Policies",
    "For complete legal terms, IP licensing agreements, democratic voting invariants, and studio leadership hierarchy, please view our full [Guidelines & Studio Charter](https://dev-api.seraphinteractive.com/guidelines) and [Terms of Service](https://dev-api.seraphinteractive.com/legal/terms) on the web platform.",
    "",
    "-# Synced dynamically from web platform • [View Full Documentation & Legal Policies](https://dev-api.seraphinteractive.com/guidelines)"
].join("\n");

export class ServerProvisioner {
    public constructor(
        private readonly settings: SettingsStore,
        private readonly logger: Logger
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
            const existing = existingRoles.find((role) => findStudioRole(role.name)?.name === definition.name);
            if (existing !== undefined) {
                if (existing.hoist !== (definition.tier !== StudioTier.Community)) {
                    await existing.setHoist(definition.tier !== StudioTier.Community, "Studio role setup").catch(() => undefined);
                }
                roleIds.set(definition.name, existing);
                continue;
            }
            const created = await guild.roles.create({
                name: definition.name,
                colors: { primaryColor: definition.color },
                hoist: definition.tier !== StudioTier.Community,
                mentionable: definition.tier !== StudioTier.Community,
                permissions: [...permissionsFor(definition.tier)],
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
            const existing = channels.find((channel) => {
                if (channel === null || channel.type !== ChannelType.GuildText) {
                    return false;
                }
                const normalized = normalizeName(channel.name);
                return aliases.some((alias) => normalizeName(alias) === normalized);
            }) as TextChannel | undefined;

            if (existing !== undefined) {
                boundChannels.push(`#${existing.name}`);
                // move to target parent category if misplaced
                if (existing.parentId !== parent.id) {
                    await existing.setParent(parent.id, { lockPermissions: false }).catch(() => undefined);
                }
                // sync permission overwrites so public channels (rules, welcome, announcements) stay visible
                await existing.permissionOverwrites.set(overwrites).catch(() => undefined);
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
        const telemetry = await ensureText(
            ChannelPurpose.Telemetry,
            staff,
            "Voting activity, bans and raid alerts.",
            privateOverwrites
        );
        const submissions = await ensureText(ChannelPurpose.TaskSubmissions, pipeline, "Deliverables waiting for review.", [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...staffRead,
            ...contributorRoles.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
            botAccess
        ]);
        const logs = await ensureText(ChannelPurpose.TaskLogs, staff, "Task activity log.", privateOverwrites);
        const rules = await ensureText(
            ChannelPurpose.Rules,
            platform,
            "Community guidelines, voting invariants, and rules.",
            readOnlyOverwrites
        );
        await welcome.setPosition(0).catch(() => undefined);
        await rules.setPosition(1).catch(() => undefined);
        await announcements.setPosition(2).catch(() => undefined);

        let forum = find(forumName, ChannelType.GuildForum) as ForumChannel | undefined;
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
        await this.ensureForumPermissions(forum);
        const tagged = await this.ensureForumTags(forum);

        const pins = await rules.messages.fetchPinned().catch(() => null);
        const botRulesMessage = pins?.find((msg) => msg.author.id === botId);
        if (botRulesMessage !== undefined) {
            await botRulesMessage.edit(message(panel(null, studioRules))).catch(() => undefined);
        } else {
            const posted = await rules.send(message(panel(null, studioRules)));
            await posted.pin().catch(() => undefined);
        }

        await this.settings.update((settings) => {
            settings.channels[ChannelPurpose.Welcome] = welcome.id;
            settings.channels[ChannelPurpose.Rules] = rules.id;
            settings.channels[ChannelPurpose.Announcements] = announcements.id;
            settings.channels[ChannelPurpose.Telemetry] = telemetry.id;
            settings.channels[ChannelPurpose.TaskSubmissions] = submissions.id;
            settings.channels[ChannelPurpose.TaskLogs] = logs.id;
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

    public async ensureForumPermissions(forum: ForumChannel): Promise<void> {
        const guild = forum.guild;
        const botId = guild.client.user.id;
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
