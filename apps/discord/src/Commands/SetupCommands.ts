import { Role } from "@platform/contracts";
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { Accent, asEdit, ephemeral, panel, pluralize } from "../Discord/Ui.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import { normalizeName } from "../Services/StudioRoles.js";
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
        const lines: string[] = ["## Server Setup", ""];

        lines.push("**Roles**");
        if (summary.createdRoles.length === 0) {
            lines.push("- All studio roles already configured.");
        } else {
            lines.push(`- Created ${pluralize(summary.createdRoles.length, "role")}: ${summary.createdRoles.join(", ")}`);
        }
        lines.push("");

        const deptItemNorms = new Set<string>();
        if (summary.departments) {
            for (const dept of summary.departments) {
                deptItemNorms.add(normalizeName(dept.categoryName));
                deptItemNorms.add(normalizeName(dept.forumName));
                for (const ch of dept.channels) {
                    deptItemNorms.add(normalizeName(ch.replace(/^#/u, "")));
                }
            }
        }

        const isDeptChannel = (name: string): boolean => {
            const clean = normalizeName(name.replace(/^#/u, ""));
            return deptItemNorms.has(clean);
        };

        const staffChannelNames = new Set([
            "task-logs",
            "voting-logs",
            "user-logs",
            "security-alerts",
            "telemetry-alerts",
            "system-logs",
            "moderation-logs"
        ]);
        const productionChannelNames = new Set(["production-announcements", "production-general", "production-management"]);
        const platformChannelNames = new Set(["announcements"]);

        const allCore = [...summary.boundChannels, ...summary.createdChannels].filter((c) => !isDeptChannel(c));
        const cleanCore = Array.from(new Set(allCore.map((c) => (c.startsWith("#") ? c : `#${c}`))));

        const staffChannels = cleanCore.filter((c) => staffChannelNames.has(normalizeName(c.replace(/^#/u, ""))));
        const productionChannels = cleanCore.filter((c) => productionChannelNames.has(normalizeName(c.replace(/^#/u, ""))));
        const platformChannels = cleanCore.filter((c) => platformChannelNames.has(normalizeName(c.replace(/^#/u, ""))));
        const otherChannels = cleanCore.filter(
            (c) =>
                !staffChannelNames.has(normalizeName(c.replace(/^#/u, ""))) &&
                !productionChannelNames.has(normalizeName(c.replace(/^#/u, ""))) &&
                !platformChannelNames.has(normalizeName(c.replace(/^#/u, "")))
        );

        if (staffChannels.length > 0) {
            lines.push("**Staff Channels**");
            lines.push(`- ${staffChannels.join(", ")}`);
            lines.push("");
        }

        if (productionChannels.length > 0) {
            lines.push("**Production Channels**");
            lines.push(`- ${productionChannels.join(", ")}`);
            lines.push("");
        }

        if (platformChannels.length > 0) {
            lines.push("**Platform Channels**");
            lines.push(`- ${platformChannels.join(", ")}`);
            lines.push("");
        }

        if (otherChannels.length > 0) {
            lines.push("**Other Channels**");
            lines.push(`- ${otherChannels.join(", ")}`);
            lines.push("");
        }

        if (summary.departments && summary.departments.length > 0) {
            lines.push("**Department Channels**");
            for (const dept of summary.departments) {
                lines.push(`- **${dept.departmentName}:** ${dept.forumName}, ${dept.channels.join(", ")}`);
            }
            lines.push("");
        }

        if (summary.deletedWebhooks && summary.deletedWebhooks.length > 0) {
            lines.push("**Residual Webhooks Cleaned Up**");
            lines.push(`- Removed ${pluralize(summary.deletedWebhooks.length, "residual webhook")}: ${summary.deletedWebhooks.join(", ")}`);
        } else {
            lines.push("**Webhooks**");
            lines.push("- All channel webhooks synced with zero residual webhooks.");
        }

        await interaction.editReply(asEdit(ephemeral(panel(null, lines.join("\n").trim()))));
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
            summary.errors.length > 0 ? `Encountered ${summary.errors.length} error(s) during sync.` : null
        ].filter((line): line is string => line !== null);

        const accent = summary.errors.length > 0 ? Accent.Warning : Accent.Success;
        await interaction.editReply(asEdit(ephemeral(panel(accent, lines.join("\n")))));
    }
};

export const setAnnouncementsCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("set-announcements")
        .setDescription("Bind the announcements channel for important public bot announcements")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption((option) => option.setName("channel").setDescription("Text channel for public announcements").setRequired(true))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        const channel = interaction.options.getChannel("channel", true);
        await context.settings.update((settings) => {
            settings.channels[ChannelPurpose.Announcements] = channel.id;
        });
        await interaction.reply(ephemeral(panel(Accent.Success, `Announcements channel bound to <#${channel.id}>.`)));
    }
};

export const testLoggingCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("test-logging")
        .setDescription("Send a test message titled 'test' across all staff logging webhooks")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        requireManageGuild(interaction);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const results = await context.dispatcher.sendStaffTestProbe();
        const lines: string[] = ["## Staff Logging Probe", ""];
        for (const res of results) {
            lines.push(`• **${res.name}:** ${res.success ? "Delivered" : `Failed (${res.error ?? "unresolved"})`}`);
        }
        await interaction.editReply(asEdit(ephemeral(panel(Accent.Info, lines.join("\n")))));
    }
};
