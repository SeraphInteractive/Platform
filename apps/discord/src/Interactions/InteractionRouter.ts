import type { Interaction } from "discord.js";
import { replyWithError, type BotContext, type ComponentHandler, type SlashCommand } from "../Commands/Command.js";
import { docsCommand, helpCommand, statusCommand } from "../Commands/InfoCommands.js";
import { assignRoleCommand, blacklistCommand } from "../Commands/ModerationCommands.js";
import { entryPageHandler, roundCommands, roundSelectHandler } from "../Commands/RoundCommands.js";
import { botSetupCommand, setChannelCommand, setupForumCommand } from "../Commands/SetupCommands.js";
import {
    availableTasksCommand,
    claimTaskButtonHandler,
    createTaskCommand,
    deliverablesButtonHandler,
    releaseTaskCommand,
    reviewButtonHandler,
    reviewModalHandler,
    submitTaskCommand,
    syncTaskCommand,
    takeTaskCommand
} from "../Commands/TaskCommands.js";
import { Accent, notice } from "../Discord/Ui.js";

export const slashCommands: readonly SlashCommand[] = [
    helpCommand,
    docsCommand,
    ...roundCommands,
    blacklistCommand,
    assignRoleCommand,
    availableTasksCommand,
    createTaskCommand,
    takeTaskCommand,
    releaseTaskCommand,
    submitTaskCommand,
    syncTaskCommand,
    botSetupCommand,
    setupForumCommand,
    setChannelCommand,
    statusCommand
];

const componentHandlers: readonly ComponentHandler[] = [
    roundSelectHandler,
    entryPageHandler,
    claimTaskButtonHandler,
    reviewButtonHandler,
    reviewModalHandler,
    deliverablesButtonHandler
];

export class InteractionRouter {
    private readonly commands = new Map(slashCommands.map((command) => [command.definition.name, command]));
    private readonly handlers = new Map(componentHandlers.map((handler) => [handler.prefix, handler]));

    public constructor(private readonly context: BotContext) {}

    public async route(interaction: Interaction): Promise<void> {
        if (interaction.guildId !== this.context.configuration.guildId) {
            if (interaction.isRepliable()) {
                await interaction.reply(notice("This bot only works in its home server.", Accent.Warning)).catch(() => undefined);
            }
            return;
        }

        if (interaction.isAutocomplete()) {
            const command = this.commands.get(interaction.commandName);
            await command?.autocomplete?.(interaction, this.context).catch(async () => {
                await interaction.respond([]).catch(() => undefined);
            });
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = this.commands.get(interaction.commandName);
            if (command === undefined) {
                return;
            }
            try {
                await command.execute(interaction, this.context);
            } catch (error: unknown) {
                await replyWithError(interaction, error, this.context.logger);
            }
            return;
        }

        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            const handler = this.handlers.get(interaction.customId.split(":")[0] ?? "");
            if (handler === undefined) {
                return;
            }
            try {
                await handler.handle(interaction, this.context);
            } catch (error: unknown) {
                await replyWithError(interaction, error, this.context.logger);
            }
        }
    }
}
