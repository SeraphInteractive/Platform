import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { asEdit, ephemeral, panel, pluralize } from "../Discord/Ui.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import { requireManageGuild, UserFacingError, type BotContext, type SlashCommand } from "./Command.js";

export const botSetupCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("bot-setup")
        .setDescription("Create the studio roles and channels this bot uses")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        if (interaction.guild === null) {
            throw new UserFacingError("Run this inside the server.");
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const summary = await context.provisioner.provision(interaction.guild);
        const lines = [
            "## Server set up",
            summary.createdRoles.length === 0
                ? "All studio roles already existed."
                : `Created ${pluralize(summary.createdRoles.length, "role")}: ${summary.createdRoles.join(", ")}`,
            summary.createdChannels.length === 0 ? "No new channels were needed." : `Created ${summary.createdChannels.join(", ")}`,
            summary.boundChannels.length === 0 ? null : `Using existing ${summary.boundChannels.join(", ")}`
        ].filter((line): line is string => line !== null);
        await interaction.editReply(asEdit(ephemeral(panel(null, lines.join("\n")))));
    }
};

export const setupForumCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("setup-forum")
        .setDescription("Choose the channels used for tasks")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((option) =>
            option.setName("forum").setDescription("Forum for task posts").addChannelTypes(ChannelType.GuildForum).setRequired(true)
        )
        .addChannelOption((option) =>
            option
                .setName("submissions")
                .setDescription("Where review requests go")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption((option) =>
            option.setName("log").setDescription("Where task activity is logged").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        if (interaction.guild === null) {
            throw new UserFacingError("Run this inside the server.");
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const forumOption = interaction.options.getChannel("forum", true, [ChannelType.GuildForum]);
        const submissions = interaction.options.getChannel("submissions", true, [ChannelType.GuildText]);
        const log = interaction.options.getChannel("log", true, [ChannelType.GuildText]);
        // fetch the full guild forum channel instance so tag mutations succeed
        const forum = await interaction.guild.channels.fetch(forumOption.id);
        if (forum?.type !== ChannelType.GuildForum) {
            throw new UserFacingError("The specified forum channel could not be found.");
        }
        await context.provisioner.ensureForumTags(forum);
        await context.settings.update((settings) => {
            settings.channels[ChannelPurpose.TaskSubmissions] = submissions.id;
            settings.channels[ChannelPurpose.TaskLogs] = log.id;
        });
        await interaction.editReply(
            asEdit(
                ephemeral(
                    panel(null, `Tasks post in <#${forum.id}>, reviews go to <#${submissions.id}>, and activity is logged in <#${log.id}>.`)
                )
            )
        );
    }
};

const channelChoices: Readonly<Record<string, readonly ChannelPurpose[]>> = {
    announcements: [ChannelPurpose.Announcements],
    alerts: [ChannelPurpose.Telemetry],
    all: [ChannelPurpose.Announcements, ChannelPurpose.Telemetry]
};

export const setChannelCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("set-announcement-channel")
        .setDescription("Choose where announcements and alerts are posted")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Target channel")
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("What to post there")
                .setRequired(true)
                .addChoices(
                    { name: "Round results and news", value: "announcements" },
                    { name: "Staff telemetry alerts", value: "alerts" },
                    { name: "Both", value: "all" }
                )
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        const channel = interaction.options.getChannel("channel", true);
        const purposes = channelChoices[interaction.options.getString("type", true)] ?? [];
        await context.settings.update((settings) => {
            for (const purpose of purposes) {
                settings.channels[purpose] = channel.id;
            }
        });
        const what = purposes
            .map((purpose) => (purpose === ChannelPurpose.Announcements ? "announcements" : "telemetry alerts"))
            .join(" and ");
        await interaction.reply(ephemeral(panel(null, `Posting ${what} in <#${channel.id}>.`)));
    }
};
