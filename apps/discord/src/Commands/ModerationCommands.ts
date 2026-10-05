import { Role, type Specialty } from "@platform/contracts";
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { asEdit, ephemeral, message, panel, plain } from "../Discord/Ui.js";
import { findStudioRole, isLeadership, platformRoleFor } from "../Services/StudioRoles.js";
import { actingAs, UserFacingError, type BotContext, type SlashCommand } from "./Command.js";

export const blacklistCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("blacklist")
        .setDescription("Ban or unban someone from voting (supervisors)")
        .addStringOption((option) =>
            option
                .setName("action")
                .setDescription("What to do")
                .setRequired(true)
                .addChoices({ name: "Ban from voting", value: "ban" }, { name: "Lift ban", value: "unban" })
        )
        .addUserOption((option) => option.setName("user").setDescription("Member to act on"))
        .addStringOption((option) => option.setName("discord_id").setDescription("Discord ID, for people who left the server"))
        .addStringOption((option) => option.setName("reason").setDescription("Why (shown to staff)").setMaxLength(500))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const target = interaction.options.getUser("user")?.id ?? interaction.options.getString("discord_id")?.trim();
        if (target === undefined || !/^\d{17,20}$/u.test(target)) {
            throw new UserFacingError("Pick a member or give a valid Discord ID.");
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const api = actingAs(interaction, context);
        const ban = interaction.options.getString("action", true) === "ban";
        const user = ban ? await api.blacklist(target, interaction.options.getString("reason")) : await api.reinstate(target);
        const text = ban
            ? `<@${user.discordId}> can no longer vote. Their existing ballots no longer count.`
            : `<@${user.discordId}> can vote again.`;
        await interaction.editReply(asEdit(ephemeral(panel(null, text))));
    }
};

export const assignRoleCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("assign-role")
        .setDescription("Give someone a studio role and matching platform access")
        .addUserOption((option) => option.setName("member").setDescription("Who gets the role").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Studio role").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("Why (kept in the audit log)").setMaxLength(300))
        .toJSON(),
    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        if (interaction.guild === null) {
            throw new UserFacingError("Run this inside the server.");
        }
        const guild = interaction.guild;
        const role = await guild.roles.fetch(interaction.options.getRole("role", true).id);
        if (role === null) {
            throw new UserFacingError("That role doesn't exist anymore.");
        }
        const studio = findStudioRole(role.name);
        if (studio === undefined) {
            throw new UserFacingError(`${plain(role.name)} isn't a studio role. Run /bot-setup to create them.`);
        }
        const member = await guild.members.fetch(interaction.options.getUser("member", true).id).catch(() => null);
        if (member === null) {
            throw new UserFacingError("That person isn't in this server.");
        }
        await interaction.deferReply();
        const api = actingAs(interaction, context);
        const reason = `${interaction.options.getString("reason") ?? "Assigned with /assign-role"} (by ${interaction.user.username})`;

        const specialtiesOf = (holder: GuildMember, extra?: Specialty): Specialty[] => {
            const specialties = holder.roles.cache
                .map((held) => findStudioRole(held.name)?.specialty)
                .filter((value): value is Specialty => value !== undefined);
            return [...new Set(extra === undefined ? specialties : [extra, ...specialties])].slice(0, 2);
        };

        const previous: GuildMember[] = [];
        if (isLeadership(studio.tier)) {
            await guild.members.fetch();
            for (const holder of role.members.values()) {
                if (holder.id === member.id) {
                    continue;
                }
                const keepsLeadership = holder.roles.cache.some(
                    (held) => held.id !== role.id && isLeadership(findStudioRole(held.name)?.tier ?? 3)
                );
                if (!keepsLeadership) {
                    await api.setRole(holder.id, Role.Contributor, specialtiesOf(holder), holder.user.globalName ?? holder.user.username);
                }
                previous.push(holder);
            }
        }
        await api.setRole(
            member.id,
            platformRoleFor(studio.tier),
            specialtiesOf(member, studio.specialty),
            member.user.globalName ?? member.user.username
        );
        for (const holder of previous) {
            await holder.roles.remove(role.id, reason.slice(0, 400));
        }
        await member.roles.add(role.id, reason.slice(0, 400));

        const lines = [
            `<@${member.id}> now has <@&${role.id}>.`,
            previous.length === 0 ? null : `Moved from ${previous.map((holder) => `<@${holder.id}>`).join(", ")}.`
        ].filter((line): line is string => line !== null);
        await interaction.editReply(asEdit(message(panel(null, lines.join("\n")))));
    }
};
