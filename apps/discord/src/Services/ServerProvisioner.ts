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
    "# 📜 Project Stairway — Studio Charter & Community Agreement",
    "*Official code of conduct, intellectual property & licensing terms, pipeline obligations, and democratic invariants.*",
    "",
    "### 1. Code of Conduct & Community Standards",
    "• **Professionalism & Mutual Respect:** Treat all members, contributors, supervisors, and directors with respect. Critique work and technical execution constructively, never individuals.",
    "• **Zero Tolerance for Harassment:** Discrimination, hate speech, bigotry, harassment, defamation, predatory conduct, and targeted toxicity result in an immediate and irreversible permanent ban.",
    "• **Constructive Collaboration:** Maintain a positive, collaborative environment. Support newer artists, give actionable feedback, and communicate transparently during collaborative tasks.",
    "• **Channel Discipline:** Keep discussions on-topic within relevant department channels and threads. Commercial solicitation, unsolicited DMs, off-topic spam, and self-promotion are strictly prohibited.",
    "",
    "### 2. Intellectual Property, Asset Warranties & Contributor Licensing",
    "• **Original Authorship Warranty:** All contributions (3D models, textures, animations, audio, rigs, shaders, code, and pitches) must be 100% original work authored by you, public domain, or permissibly open-source.",
    "• **Prohibited Assets:** Uploading ripped assets from third-party games, uncredited copyrighted models, or AI outputs without verifiable training provenance is strictly forbidden.",
    "• **Irrevocable Production Grant:** By submitting any deliverable, `.blend` file, or creative pitch to the platform or grab-box, you grant Project Stairway and Squared Media an irrevocable, perpetual, worldwide, royalty-free license to use, adapt, modify, composite, render, and distribute your work in the official film release, behind-the-scenes material, and related promotional media.",
    "• **Attribution Rights:** Approved contributors receive permanent credit in the film's official credits ledger and on the web platform under their verified identity.",
    "",
    "### 3. Contributor Pipeline & Grab-Box Obligations",
    "• **Task Commitment & Tiers:** Claim only tasks you have the skills and bandwidth to complete within the designated tier timeframe (Tier 1: 1–2 days, Tier 2: 3–4 days, Tier 3: 5–7 days, Tier 4: 10–14 days).",
    "• **Mandatory Deliverable Standards:** Every grab-box deliverable requires two files: an inspectable, organized `.blend` file (proper collection hierarchy, clean geometry, packed assets) and a compressed video viewport render (`MP4`/`WebM`).",
    "• **Proactive Release Invariant:** If you are unable to complete a claimed task before the deadline, you must release it immediately using `/release-task` or the web platform so another artist can continue without bottlenecking production.",
    "• **Quality Assurance & Supervisor Authority:** Department supervisors hold final authority over technical QA, topology standards, and artistic continuity. Revisions requested in Discord review threads must be resolved before downstream handover.",
    "",
    "### 4. Democratic Voting Integrity & Mathematical Invariants",
    "• **Single Verified Voter:** Exactly one account per individual, verified via zero-knowledge HMAC-SHA256 email hashing. Multi-accounting, sockpuppeting, and vote farming are strictly prohibited.",
    "• **Ranked-Choice Invariant (3-2-1 Borda):** Ballots distribute 3, 2, and 1 points respectively (`6 points/ballot`). Total round points are mathematically conserved: `Total_Points = 6 × Total_Ballots`.",
    "• **Bayesian Shrinkage Smoothing (K=30):** Early scores are regularized against prior distributions to prevent sample-size skew and brigading anomalies.",
    "• **Real-Time Telemetry & Anti-Cheat:** Automated detection engines continuously audit velocity bursts ($Z > 2.5$), rank entropy collapse, and unnatural clustering. Fraudulent ballots trigger automatic quarantine and actor blacklisting.",
    "",
    "### 5. Governance, Leadership Seats & Dispute Resolution",
    "• **Single-Seat Hierarchy:** Executive (Producer, Creative Director, Production Manager, Admin) and Department Lead roles are single-holder seats assigned and synchronized via `/assign-role`.",
    "• **Dispute Escalation:** Procedural or creative disagreements escalate directly to the Producer and Creative Director, whose rulings are final.",
    "• **Enforcement & Sanctions:** Violations of these guidelines, conduct policies, or licensing terms will result in progressive disciplinary action: deliverable rejection, grab-box lockout, role revocation, temporary suspension, or permanent cross-platform blacklisting.",
    "",
    "-# Synced dynamically from web platform • [View Full Documentation & Legal Policies](https://dev-api.seraphinteractive.com/documentation)"
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
