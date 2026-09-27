import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { buttons, divider, ephemeral, linkButton, message, panel, when } from "../Discord/Ui.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import { requireManageGuild, type BotContext, type SlashCommand } from "./Command.js";

const helpText = [
    "## Commands",
    "**Voting**",
    "`/rounds` • `/round` • `/vote` • `/ballot` • `/results` • `/telemetry`",
    "**Tasks & Grab-Box**",
    "`/available-tasks` • `/take-task` • `/release-task` • `/submit-task`",
    "**Staff & Production**",
    "`/create-task` • `/sync-task` • `/assign-role` • `/blacklist`",
    "**Server Administration**",
    "`/bot-setup` • `/setup-forum` • `/set-channel` • `/bot-status` • `/help` • `/docs`"
].join("\n");

const docsText = [
    "## How voting works",
    "**Binary rounds** have two options. Each ballot is one vote, and results show each option's share.",
    "**Ranked choice rounds** take your top three: 3 points for first, 2 for second, 1 for third. Scores are smoothed so an entry with only a few votes can't jump to the top.",
    "**Fair play.** Accounts caught botting or brigading are banned from voting and their ballots stop counting. Entries under a suspected raid are pulled from the ballot until staff review them."
].join("\n\n");

export const helpCommand: SlashCommand = {
    definition: new SlashCommandBuilder().setName("help").setDescription("List the bot's commands").toJSON(),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply(ephemeral(panel(null, helpText)));
    }
};

export const docsCommand: SlashCommand = {
    definition: new SlashCommandBuilder().setName("docs").setDescription("How voting and scoring work").toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        await interaction.reply(
            message(panel(null, docsText, divider(), buttons(linkButton("Full documentation", `${context.configuration.webAppUrl}/docs`))))
        );
    }
};

export const statusCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("bot-status")
        .setDescription("Check the bot's connection to Discord and the platform")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const health = await context.api.isHealthy();
        const stream = context.consumer.status;
        const channel = (purpose: ChannelPurpose): string => {
            const id = context.settings.channel(purpose);
            return id === undefined ? "not set" : `<#${id}>`;
        };
        const lines = [
            "## Status",
            `Discord gateway: ${interaction.client.ws.ping >= 0 ? `${interaction.client.ws.ping} ms` : "connecting"}`,
            `Platform API: ${health.healthy ? `healthy, ${health.latencyMs} ms` : "unreachable"}`,
            `Notification stream: ${stream.connected ? "connected" : "disconnected"}${stream.lastEventAt === null ? "" : `, last event ${when(stream.lastEventAt.toISOString())}`}`,
            "",
            `Announcements: ${channel(ChannelPurpose.Announcements)}`,
            `Telemetry: ${channel(ChannelPurpose.Telemetry)}`,
            `Task forum: ${channel(ChannelPurpose.TaskForum)}`,
            `Task submissions: ${channel(ChannelPurpose.TaskSubmissions)}`,
            `Task log: ${channel(ChannelPurpose.TaskLogs)}`
        ];
        await interaction.editReply({
            components: [panel(null, lines.join("\n"))],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] }
        });
    }
};
