import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    ModalBuilder,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
    type SendableChannels
} from "discord.js";
import { Accent, ephemeral, message, notice, panel, plain } from "../Discord/Ui.js";
import { isLeadership, studioRoles } from "../Services/StudioRoles.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import type { BotContext, ComponentHandler, SlashCommand } from "./Command.js";

export const banApologyCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("ban-apology")
        .setDescription("Submit a ban apology review request if you were banned from Project Stairway")
        .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild)
        .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
        .addStringOption((option) =>
            option
                .setName("apology")
                .setDescription("Your apology statement and commitment to follow community rules")
                .setRequired(true)
                .setMinLength(20)
                .setMaxLength(1500)
        )
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const apologyText = interaction.options.getString("apology", true).trim();
        const record = context.warnings.getRecord(interaction.user.id);
        if (record === undefined || record.offenceLevel < 3) {
            await interaction.reply(notice("Only members with an active ban can submit an apology review.", Accent.Warning));
            return;
        }

        if (record.apology.status === "pending") {
            await interaction.reply(notice("You already have an apology review pending supervisor evaluation.", Accent.Warning));
            return;
        }

        try {
            context.warnings.submitApology(interaction.user.id, apologyText);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Failed to submit apology.";
            await interaction.reply(notice(msg, Accent.Danger));
            return;
        }

        await interaction.reply(
            message(
                panel(
                    Accent.Success,
                    `📜 **Ban Apology Submitted Successfully**`,
                    `Your apology has been forwarded to the Project Stairway supervisor team for review.\n` +
                        `You will receive a direct message when a decision has been reached.`
                )
            )
        );

        const modChannelId = context.settings.channel(ChannelPurpose.ModerationLogs);
        if (modChannelId !== undefined) {
            const ch = await interaction.client.channels.fetch(modChannelId).catch(() => null);
            if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
                const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apology_decision:approve:${interaction.user.id}`)
                        .setLabel("Approve & Unban")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`apology_decision:reject:${interaction.user.id}`)
                        .setLabel("Reject Apology")
                        .setStyle(ButtonStyle.Danger)
                );

                await (ch as SendableChannels).send({
                    content:
                        `# 📜 Ban Apology Review Request\n` +
                        `**User:** <@${interaction.user.id}> (${plain(interaction.user.tag ?? interaction.user.username)})\n` +
                        `**User ID:** \`${interaction.user.id}\`\n` +
                        `**Submitted At:** <t:${Math.floor(Date.now() / 1000)}:f>\n\n` +
                        `**Apology Statement:**\n> ${plain(apologyText, 1400)}\n\n` +
                        `*Supervisors and administrators can approve or reject this request below:*`,
                    components: [buttonsRow]
                });
            }
        }
    }
};

function isStaffMember(interaction: ButtonInteraction): boolean {
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

export const apologyRequestButtonHandler: ComponentHandler = {
    prefix: "apology_request",
    async handle(interaction: ButtonInteraction, context: BotContext): Promise<void> {
        const record = context.warnings.getRecord(interaction.user.id);
        if (record === undefined || record.offenceLevel < 3) {
            await interaction.reply(notice("Only members with an active ban can request an apology review.", Accent.Warning));
            return;
        }

        if (record.apology.status === "pending") {
            await interaction.reply(notice("You already have an apology review pending supervisor evaluation.", Accent.Warning));
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId("apology_modal")
            .setTitle("Ban Apology Review Request")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("apology_text")
                        .setLabel("Your Apology & Explanation")
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder("Explain why you broke rules, apologize, and commit to following community standards...")
                        .setRequired(true)
                        .setMinLength(20)
                        .setMaxLength(1500)
                )
            );

        await interaction.showModal(modal);
    }
};

export const apologyModalHandler: ComponentHandler = {
    prefix: "apology_modal",
    async handle(interaction: ModalSubmitInteraction, context: BotContext): Promise<void> {
        const apologyText = interaction.fields.getTextInputValue("apology_text").trim();

        try {
            context.warnings.submitApology(interaction.user.id, apologyText);
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Failed to submit apology.";
            await interaction.reply(notice(msg, Accent.Danger));
            return;
        }

        await interaction.reply(
            ephemeral(
                panel(
                    Accent.Success,
                    `📜 **Apology Submitted Successfully**`,
                    `Your ban apology has been forwarded to the Project Stairway supervisor team for review.\n` +
                        `You will receive a direct message when a decision is made.`
                )
            )
        );

        // post review ticket to #moderation-logs
        const modChannelId = context.settings.channel(ChannelPurpose.ModerationLogs);
        if (modChannelId !== undefined) {
            const ch = await interaction.client.channels.fetch(modChannelId).catch(() => null);
            if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
                const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apology_decision:approve:${interaction.user.id}`)
                        .setLabel("Approve & Unban")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`apology_decision:reject:${interaction.user.id}`)
                        .setLabel("Reject Apology")
                        .setStyle(ButtonStyle.Danger)
                );

                await (ch as SendableChannels).send({
                    content:
                        `# 📜 Ban Apology Review Request\n` +
                        `**User:** <@${interaction.user.id}> (${plain(interaction.user.tag ?? interaction.user.username)})\n` +
                        `**User ID:** \`${interaction.user.id}\`\n` +
                        `**Submitted At:** <t:${Math.floor(Date.now() / 1000)}:f>\n\n` +
                        `**Apology Statement:**\n> ${plain(apologyText, 1400)}\n\n` +
                        `*Supervisors and administrators can approve or reject this request below:*`,
                    components: [buttonsRow]
                });
            }
        }
    }
};

export const apologyDecisionButtonHandler: ComponentHandler = {
    prefix: "apology_decision",
    async handle(interaction: ButtonInteraction, context: BotContext): Promise<void> {
        if (!isStaffMember(interaction)) {
            await interaction.reply(notice("Only department supervisors and administrators can review ban apologies.", Accent.Danger));
            return;
        }

        const parts = interaction.customId.split(":");
        const action = parts[1];
        const targetUserId = parts[2];

        if (targetUserId === undefined || (action !== "approve" && action !== "reject")) {
            await interaction.reply(notice("Invalid apology review payload.", Accent.Danger));
            return;
        }

        await interaction.deferUpdate();

        const guild =
            interaction.client.guilds.cache.get(context.configuration.guildId) ??
            (await interaction.client.guilds.fetch(context.configuration.guildId).catch(() => null));

        const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);

        if (action === "approve") {
            try {
                context.warnings.reviewApology(targetUserId, true, interaction.user.id);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : "Failed to approve apology.";
                await interaction.followUp(notice(msg, Accent.Danger));
                return;
            }

            if (guild !== null) {
                await guild.bans.remove(targetUserId, `Ban apology approved by ${interaction.user.tag}`).catch(() => undefined);
            }

            // notify target user in DM
            if (targetUser !== null) {
                await targetUser
                    .send(
                        message(
                            panel(
                                Accent.Success,
                                `🎉 **Ban Apology Approved — Welcome Back**`,
                                `Your ban apology has been reviewed and **APPROVED** by <@${interaction.user.id}>.\n\n` +
                                    `Your offences and warnings have been **automatically reset**.\n` +
                                    `Please review the server rules to avoid future disciplinary action:\n` +
                                    `• [Discord Rules](https://dev-api.seraphinteractive.com/rules)`
                            )
                        )
                    )
                    .catch(() => undefined);
            }

            await interaction.editReply({
                content:
                    `# 📜 Ban Apology Review — APPROVED ✅\n` +
                    `**User:** <@${targetUserId}>\n` +
                    `**Reviewed By:** <@${interaction.user.id}>\n` +
                    `**Result:** User was unbanned and offences were automatically reset to 0.\n` +
                    `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`,
                components: []
            });
        } else {
            try {
                context.warnings.reviewApology(targetUserId, false, interaction.user.id);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : "Failed to reject apology.";
                await interaction.followUp(notice(msg, Accent.Danger));
                return;
            }

            // notify target user in DM
            if (targetUser !== null) {
                await targetUser
                    .send(
                        message(
                            panel(
                                Accent.Danger,
                                `⚠️ **Ban Apology Rejected**`,
                                `Your ban apology review was evaluated by the supervisor team and **REJECTED**.\n` +
                                    `Your server ban remains in effect.`
                            )
                        )
                    )
                    .catch(() => undefined);
            }

            await interaction.editReply({
                content:
                    `# 📜 Ban Apology Review — REJECTED ❌\n` +
                    `**User:** <@${targetUserId}>\n` +
                    `**Reviewed By:** <@${interaction.user.id}>\n` +
                    `**Result:** Apology rejected. Ban remains in effect.\n` +
                    `**Timestamp:** <t:${Math.floor(Date.now() / 1000)}:R>`,
                components: []
            });
        }
    }
};
