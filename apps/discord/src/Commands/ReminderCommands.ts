import { SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from "discord.js";
import { parseReminderTime } from "../Common/TimeParser.js";
import { Accent, ephemeral, panel, truncate, when } from "../Discord/Ui.js";
import { UserFacingError, type BotContext, type SlashCommand } from "./Command.js";

export const reminderCommand: SlashCommand = {
    definition: new SlashCommandBuilder()
        .setName("reminder")
        .setDescription("Set personal reminders")
        .addSubcommand((sub) =>
            sub
                .setName("set")
                .setDescription("Set a new reminder")
                .addStringOption((opt) => opt.setName("when").setDescription("When to remind (30m, 2h, 1d12h, or 2024-10-15 14:00)").setRequired(true))
                .addStringOption((opt) => opt.setName("message").setDescription("What to remind you about").setRequired(true).setMaxLength(500))
        )
        .addSubcommand((sub) => sub.setName("list").setDescription("List your active reminders"))
        .addSubcommand((sub) =>
            sub
                .setName("cancel")
                .setDescription("Cancel a pending reminder")
                .addStringOption((opt) => opt.setName("reminder").setDescription("The reminder to cancel").setRequired(true).setAutocomplete(true))
        )
        .toJSON(),

    async execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void> {
        const sub = interaction.options.getSubcommand(true);

        if (sub === "set") {
            const whenInput = interaction.options.getString("when", true);
            const message = interaction.options.getString("message", true);
            const fireAt = parseReminderTime(whenInput);

            let reminder;
            try {
                reminder = context.reminders.add(interaction.user.id, message, fireAt);
            } catch (error: unknown) {
                throw new UserFacingError(error instanceof Error ? error.message : "Failed to create reminder.");
            }

            context.reminderScheduler.reschedule();

            await interaction.reply(
                ephemeral(
                    panel(
                        Accent.Success,
                        `## ⏰ Reminder set\n${truncate(reminder.message, 200)}\n\nFires ${when(reminder.fireAt)} • I'll DM you.`
                    )
                )
            );
            return;
        }

        if (sub === "list") {
            const reminders = context.reminders.forUser(interaction.user.id);
            if (reminders.length === 0) {
                await interaction.reply(ephemeral(panel(null, "You don't have any active reminders.")));
                return;
            }

            const lines = reminders.map((r, i) => `**${i + 1}.** ${truncate(r.message, 100)} — ${when(r.fireAt)}`);
            await interaction.reply(ephemeral(panel(null, `## Your reminders\n${lines.join("\n")}`)));
            return;
        }

        if (sub === "cancel") {
            const id = interaction.options.getString("reminder", true);
            const removed = context.reminders.remove(id, interaction.user.id);
            if (!removed) {
                throw new UserFacingError("Reminder not found or it already fired.");
            }
            context.reminderScheduler.reschedule();
            await interaction.reply(ephemeral(panel(Accent.Success, "Reminder cancelled.")));
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, context: BotContext): Promise<void> {
        const focused = interaction.options.getFocused().toLowerCase();
        const reminders = context.reminders.forUser(interaction.user.id);
        const choices = reminders
            .filter((r) => focused.length === 0 || r.message.toLowerCase().includes(focused))
            .slice(0, 25)
            .map((r) => ({
                name: truncate(r.message, 80) + ` (${new Date(r.fireAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`,
                value: r.id
            }));
        await interaction.respond(choices);
    }
};
