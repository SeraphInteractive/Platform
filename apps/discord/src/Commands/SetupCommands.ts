import { Role } from "@platform/contracts";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { Accent, asEdit, ephemeral, panel, pluralize } from "../Discord/Ui.js";
import { requireManageGuild, requirePlatformRole, UserFacingError, type BotContext, type SlashCommand } from "./Command.js";

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

export const syncRolesCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("sync-roles")
        .setDescription("Reorder server roles by hierarchy and reconcile member roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        if (interaction.guild === null) {
            throw new UserFacingError("Run this inside the server.");
        }
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await requirePlatformRole(interaction, context, Role.Supervisor);
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const summary = await context.roleReconciler.reconcile(interaction.guild, "manual");

        const lines = [
            "## Role Hierarchy & Member Sync Complete",
            `• Positioned **${summary.reorderedRoles}** studio roles by hierarchy (Executive > Supervisor > Contributor > Community).`,
            `• Checked **${summary.totalUsersChecked}** registered users, reconciled **${summary.driftedMembersSynced}** drifted ${pluralize(summary.driftedMembersSynced, "member")}.`,
            summary.errors.length > 0 ? `⚠️ Encountered ${summary.errors.length} error(s) during sync.` : null
        ].filter((line): line is string => line !== null);

        const accent = summary.errors.length > 0 ? Accent.Warning : Accent.Success;
        await interaction.editReply(asEdit(ephemeral(panel(accent, lines.join("\n")))));
    }
};
