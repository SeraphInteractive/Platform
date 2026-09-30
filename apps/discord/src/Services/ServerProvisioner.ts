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
import {
    contributorRoleName,
    findStudioRole,
    normalizeName,
    observerRoleName,
    permissionsFor,
    studioRoles,
    StudioTier
} from "./StudioRoles.js";

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
    [ChannelPurpose.Rules]: "rules",
    [ChannelPurpose.Announcements]: "announcements",
    [ChannelPurpose.Telemetry]: "telemetry-alerts",
    [ChannelPurpose.TaskSubmissions]: "task-submissions",
    [ChannelPurpose.TaskLogs]: "task-logs"
};

const forumName = "tasks";

export const studioRules = [
    "# 📜 Studio Guidelines & System Integrity",
    "*Official community voting rules, mathematical invariants, and production workflow.*",
    "",
    "### 1. Community Philosophy & Roles",
    "• **Voters (Community):** Democratic participation in film rounds and story pitches.",
    "• **Contributors:** Claim 3D modeling, animation, layout, lighting, or sound tasks from the Grab-Box.",
    "• **Supervisors & Admins:** Lead departments, QA deliverables, trigger binary polls, and audit integrity.",
    "",
    "### 2. Voting Math & Invariants",
    "• **Ranked-Choice (3-2-1 Borda):** Top 3 choices receive 3, 2, and 1 point respectively (`6 points/ballot`).",
    "• **Point Conservation Law:** `Total_Points = 6 × Total_Ballots` (strictly enforced by real-time invariants).",
    "• **Bayesian Shrinkage (K=30):** Pulls low-sample spikes toward prior mean to prevent brigading takeovers.",
    "",
    "### 3. Anti-Cheat & Anomaly Telemetry",
    "• **Velocity Z-Score (Z > 2.5):** Flags automated ballot surges within sliding 5-minute windows.",
    "• **Shannon Rank Entropy (H < 0.35):** Detects coordinated bullet-voting rings.",
    "• **Permanent Audit Ledger:** Certified election outcomes are signed and immutable.",
    "",
    "### 4. Contributor Grab-Box",
    "• Claim tasks across 4 difficulty tiers.",
    "• Deliverables require `.blend` scene source files and compressed video previews for supervisor review.",
    "",
    "-# Synced dynamically from web platform • [View Full Documentation](https://dev-api.seraphinteractive.com/documentation)"
].join("\n");

export class ServerProvisioner {
    public constructor(
        private readonly settings: SettingsStore,
        private readonly logger: Logger
    ) {}

    public async bindExisting(guild: Guild): Promise<void> {
        const [roles, channels] = await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
        await this.settings.update((settings) => {
            const observer = roles.find((role) => normalizeName(role.name) === normalizeName(observerRoleName));
            const contributor = roles.find((role) => normalizeName(role.name) === normalizeName(contributorRoleName));
            settings.roles[BoundRole.Observer] ??= observer?.id;
            settings.roles[BoundRole.Contributor] ??= contributor?.id;
            for (const [purpose, name] of Object.entries(channelNames) as [ChannelPurpose, string][]) {
                const match = channels.find(
                    (channel) =>
                        channel !== null && channel.type === ChannelType.GuildText && normalizeName(channel.name) === normalizeName(name)
                );
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
            name: string,
            parent: CategoryChannel,
            topic: string,
            overwrites: OverwriteResolvable[]
        ): Promise<TextChannel> => {
            const existing = find(name, ChannelType.GuildText);
            if (existing?.type === ChannelType.GuildText) {
                boundChannels.push(`#${existing.name}`);
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

        const announcements = await ensureText(
            channelNames[ChannelPurpose.Announcements],
            platform,
            "Round results and studio news.",
            readOnlyOverwrites
        );
        const telemetry = await ensureText(
            channelNames[ChannelPurpose.Telemetry],
            staff,
            "Voting activity, bans and raid alerts.",
            privateOverwrites
        );
        const submissions = await ensureText(channelNames[ChannelPurpose.TaskSubmissions], pipeline, "Deliverables waiting for review.", [
            { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
            ...staffRead,
            ...contributorRoles.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
            botAccess
        ]);
        const logs = await ensureText(channelNames[ChannelPurpose.TaskLogs], staff, "Task activity log.", privateOverwrites);
        const rules = await ensureText(
            channelNames[ChannelPurpose.Rules],
            platform,
            "Community guidelines, voting invariants, and rules.",
            readOnlyOverwrites
        );
        await rules.setPosition(0).catch(() => undefined);

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
        if (pins === null || pins.size === 0) {
            const posted = await rules.send(message(panel(null, studioRules)));
            await posted.pin().catch(() => undefined);
        }

        await this.settings.update((settings) => {
            settings.channels[ChannelPurpose.Rules] = rules.id;
            settings.channels[ChannelPurpose.Announcements] = announcements.id;
            settings.channels[ChannelPurpose.Telemetry] = telemetry.id;
            settings.channels[ChannelPurpose.TaskSubmissions] = submissions.id;
            settings.channels[ChannelPurpose.TaskLogs] = logs.id;
            settings.channels[ChannelPurpose.TaskForum] = tagged.id;
            settings.roles[BoundRole.Observer] = roleIds.get(observerRoleName)?.id;
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
            const match = roleList.find((role) => role !== null && role !== undefined && normalizeName(role.name) === normalizeName(definition.name));
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
