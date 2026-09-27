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
    [ChannelPurpose.Announcements]: "announcements",
    [ChannelPurpose.Telemetry]: "telemetry-alerts",
    [ChannelPurpose.TaskSubmissions]: "task-submissions",
    [ChannelPurpose.TaskLogs]: "task-logs"
};

const forumName = "tasks";
const rulesChannelName = "studio-rules";

export const studioRules = [
    "## Studio rules",
    "**Leadership seats hold one person.** Executive and department roles have a single seat. Assigning one with /assign-role moves it from the current holder.",
    "**Assign roles through the bot.** /assign-role keeps Discord roles and platform permissions in sync. Manual role changes don't reach the platform.",
    "**Reviews.** Department supervisors review submissions for their department. Approved work is locked and handed downstream.",
    "**Contributor and community roles** have no seat limit.",
    "**Disputes** go to the Producer and Creative Director."
].join("\n\n");

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
        const rules = await ensureText(rulesChannelName, staff, "How roles and reviews work.", privateOverwrites);

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

        if ((await rules.messages.fetchPins()).items.length === 0) {
            const posted = await rules.send(message(panel(null, studioRules)));
            await posted.pin().catch(() => undefined);
        }

        await this.settings.update((settings) => {
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
}
