import {
    ActionRowBuilder,
    ButtonBuilder,
    type ButtonInteraction,
    ButtonStyle,
    type ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    type SendableChannels,
    SlashCommandBuilder
} from "discord.js";
import { Accent, message, notice, panel, plain } from "../Discord/Ui.js";
import { isLeadership, studioRoles } from "../Services/StudioRoles.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import type { UserWarningRecord } from "../State/WarningStore.js";
import { UserFacingError, type BotContext, type ComponentHandler, type SlashCommand } from "./Command.js";

function isStaffMember(interaction: ChatInputCommandInteraction | ButtonInteraction): boolean {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    const member = interaction.member;
    if (member !== null && "roles" in member && member.roles && "cache" in member.roles) {
        return member.roles.cache.some((role: { name: string }) => {
            const studio = studioRoles.find((r) => r.name === role.name);
            return studio !== undefined && isLeadership(studio.tier);
        });
    }
    return false;
}

export function formatModStatus(
    userId: string,
    tag: string,
    record: UserWarningRecord | undefined,
    isTimedOut: boolean,
    timeoutUntil: number | null | undefined,
    isBanned: boolean
): { text: string; row: ActionRowBuilder<ButtonBuilder> } {
    const level = record?.offenceLevel ?? 0;
    const stageWarnings = record?.stageWarnings ?? 0;
    const maxWarnings = level === 0 ? 5 : level === 1 ? 3 : 1;

    let stageLabel = "Clean";
    if (level === 1) {
        stageLabel = "1st Offence (24h timeout stage)";
    } else if (level === 2) {
        stageLabel = "2nd Offence (1-week timeout stage)";
    } else if (level >= 3) {
        stageLabel = "3rd Offence (Banned)";
    }

    const timeoutStr = isTimedOut && timeoutUntil ? `Active until <t:${Math.floor(timeoutUntil / 1000)}:R>` : "Inactive";
    const apologyStr = record?.apology.status ?? "none";
    const infractionsCount = record?.infractions.length ?? 0;

    const lines = [
        `### Moderation Status: <@${userId}>`,
        `**User:** \`${plain(tag)}\` (\`${userId}\`)`,
        `**Offence Level:** Stage ${level} (${stageLabel})`,
        `**Stage Warnings:** ${stageWarnings}/${maxWarnings}`,
        `**Active Infractions (30d):** ${infractionsCount}`,
        `**Timeout Status:** ${timeoutStr}`,
        `**Discord Ban:** ${isBanned ? "Yes" : "No"}`,
        `**Apology Review:** ${apologyStr}`
    ];

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`mod_step_down:${userId}`).setLabel("Step Down Stage").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`mod_reset:${userId}`).setLabel("Reset Warnings").setStyle(ButtonStyle.Danger)
    );

    return { text: lines.join("\n"), row };
}

export const modStatusCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("mod-status")
        .setDescription("Check offence level, warnings, and moderation state for a member (supervisors)")
        .addUserOption((opt) => opt.setName("user").setDescription("Member to inspect").setRequired(true))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        if (!isStaffMember(interaction)) {
            throw new UserFacingError("Only department supervisors and administrators can inspect moderation status.");
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser("user", true);
        const guild = interaction.guild ?? (await interaction.client.guilds.fetch(context.configuration.guildId).catch(() => null));

        if (guild === null) {
            throw new UserFacingError("Server could not be reached.");
        }

        const record = context.warnings.getRecord(targetUser.id);
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        const isTimedOut = targetMember?.isCommunicationDisabled() ?? false;
        const timeoutUntil = targetMember?.communicationDisabledUntilTimestamp;
        const isBanned = await guild.bans
            .fetch(targetUser.id)
            .then(() => true)
            .catch(() => false);

        const { text, row } = formatModStatus(
            targetUser.id,
            targetUser.tag ?? targetUser.username,
            record,
            isTimedOut,
            timeoutUntil,
            isBanned
        );

        if (typeof interaction.editReply === "function") {
            await interaction.editReply({
                components: [panel(Accent.Info, text), row]
            });
        } else {
            await interaction.reply({
                components: [panel(Accent.Info, text), row],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};

export const modStepDownButtonHandler: ComponentHandler = {
    prefix: "mod_step_down",
    async handle(interaction: ButtonInteraction, context: BotContext): Promise<void> {
        if (!isStaffMember(interaction)) {
            await interaction.reply(notice("Only department supervisors and administrators can manage moderation stages.", Accent.Danger));
            return;
        }

        const targetUserId = interaction.customId.split(":")[1];
        if (targetUserId === undefined) {
            await interaction.reply(notice("Invalid action payload.", Accent.Danger));
            return;
        }

        const guild = interaction.guild ?? (await interaction.client.guilds.fetch(context.configuration.guildId).catch(() => null));

        if (guild === null) {
            await interaction.reply(notice("Server could not be reached.", Accent.Danger));
            return;
        }

        await interaction.deferUpdate();

        const updated = context.warnings.stepDownStage(targetUserId);
        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
        const isTimedOut = targetMember?.isCommunicationDisabled() ?? false;
        const timeoutUntil = targetMember?.communicationDisabledUntilTimestamp;
        const isBanned = await guild.bans
            .fetch(targetUserId)
            .then(() => true)
            .catch(() => false);

        // log to #moderation-logs
        const modChannelId = context.settings.channel(ChannelPurpose.ModerationLogs);
        if (modChannelId !== undefined) {
            const ch = await interaction.client.channels.fetch(modChannelId).catch(() => null);
            if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
                await (ch as SendableChannels).send(
                    message(
                        panel(
                            Accent.Info,
                            "**Moderation Stage Stepped Down**",
                            `**Staff Action:** <@${interaction.user.id}>\n` +
                                `**Target Member:** <@${targetUserId}>\n` +
                                `**New Stage:** Stage ${updated.offenceLevel}\n` +
                                `**Stage Warnings:** Reset to 0`
                        )
                    )
                );
            }
        }

        const { text, row } = formatModStatus(
            targetUserId,
            targetUser?.tag ?? targetUser?.username ?? targetUserId,
            updated,
            isTimedOut,
            timeoutUntil,
            isBanned
        );

        if (typeof interaction.editReply === "function") {
            await interaction.editReply({
                components: [panel(Accent.Info, text), row]
            });
        } else {
            await interaction.update({
                components: [panel(Accent.Info, text), row]
            });
        }
    }
};

export const modResetButtonHandler: ComponentHandler = {
    prefix: "mod_reset",
    async handle(interaction: ButtonInteraction, context: BotContext): Promise<void> {
        if (!isStaffMember(interaction)) {
            await interaction.reply(notice("Only department supervisors and administrators can reset warnings.", Accent.Danger));
            return;
        }

        const targetUserId = interaction.customId.split(":")[1];
        if (targetUserId === undefined) {
            await interaction.reply(notice("Invalid action payload.", Accent.Danger));
            return;
        }

        const guild = interaction.guild ?? (await interaction.client.guilds.fetch(context.configuration.guildId).catch(() => null));

        if (guild === null) {
            await interaction.reply(notice("Server could not be reached.", Accent.Danger));
            return;
        }

        await interaction.deferUpdate();

        context.warnings.resetUser(targetUserId);
        const updated = context.warnings.getRecord(targetUserId);
        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
        const isTimedOut = targetMember?.isCommunicationDisabled() ?? false;
        const timeoutUntil = targetMember?.communicationDisabledUntilTimestamp;
        const isBanned = await guild.bans
            .fetch(targetUserId)
            .then(() => true)
            .catch(() => false);

        // log to #moderation-logs
        const modChannelId = context.settings.channel(ChannelPurpose.ModerationLogs);
        if (modChannelId !== undefined) {
            const ch = await interaction.client.channels.fetch(modChannelId).catch(() => null);
            if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
                await (ch as SendableChannels).send(
                    message(
                        panel(
                            Accent.Success,
                            "**Moderation State Reset**",
                            `**Staff Action:** <@${interaction.user.id}>\n` +
                                `**Target Member:** <@${targetUserId}>\n` +
                                `**Result:** All infractions, warnings, and offences reset to 0.`
                        )
                    )
                );
            }
        }

        const { text, row } = formatModStatus(
            targetUserId,
            targetUser?.tag ?? targetUser?.username ?? targetUserId,
            updated,
            isTimedOut,
            timeoutUntil,
            isBanned
        );

        if (typeof interaction.editReply === "function") {
            await interaction.editReply({
                components: [panel(Accent.Info, text), row]
            });
        } else {
            await interaction.update({
                components: [panel(Accent.Info, text), row]
            });
        }
    }
};
