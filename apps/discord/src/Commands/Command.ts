import { Role } from "@platform/contracts";
import {
    PermissionFlagsBits,
    type AutocompleteInteraction,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type ModalSubmitInteraction,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
    type StringSelectMenuInteraction,
    type User
} from "discord.js";
import type { Logger } from "pino";
import type { NotificationConsumer } from "../Api/NotificationConsumer.js";
import { PlatformApiError, type ActingApiClient, type DiscordIdentity, type PlatformApiClient } from "../Api/PlatformApiClient.js";
import type { BotConfiguration } from "../Configuration/BotConfiguration.js";
import { Accent, notice } from "../Discord/Ui.js";
import type { ServerProvisioner } from "../Services/ServerProvisioner.js";
import type { TaskForum } from "../Services/TaskForum.js";
import type { SettingsStore } from "../State/SettingsStore.js";

export interface BotContext {
    readonly configuration: BotConfiguration;
    readonly api: PlatformApiClient;
    readonly settings: SettingsStore;
    readonly forum: TaskForum;
    readonly provisioner: ServerProvisioner;
    readonly consumer: NotificationConsumer;
    readonly logger: Logger;
}

export interface SlashCommand {
    readonly definition: RESTPostAPIChatInputApplicationCommandsJSONBody;
    execute(interaction: ChatInputCommandInteraction, context: BotContext): Promise<void>;
    autocomplete?(interaction: AutocompleteInteraction, context: BotContext): Promise<void>;
}

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export interface ComponentHandler {
    readonly prefix: string;
    handle(interaction: ComponentInteraction, context: BotContext): Promise<void>;
}

export class UserFacingError extends Error {}

const roleOrder: readonly Role[] = [Role.Voter, Role.Contributor, Role.SeniorContributor, Role.Moderator, Role.Supervisor, Role.Admin, Role.SuperAdmin];

export function hasAtLeast(role: Role, required: Role): boolean {
    return roleOrder.indexOf(role) >= roleOrder.indexOf(required);
}

export function identityOf(user: User): DiscordIdentity {
    return { id: user.id, username: user.globalName ?? user.username, avatar: user.avatar };
}

export function actingAs(interaction: { readonly user: User }, context: BotContext): ActingApiClient {
    return context.api.as(identityOf(interaction.user));
}

export async function requirePlatformRole(interaction: { readonly user: User }, context: BotContext, required: Role): Promise<void> {
    const me = await actingAs(interaction, context).me();
    if (!hasAtLeast(me.role, required)) {
        throw new UserFacingError(`You need the ${required.replace(/_/gu, " ")} role or higher on the platform to do that.`);
    }
}

export function requireManageGuild(interaction: ChatInputCommandInteraction): void {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) !== true) {
        throw new UserFacingError("You need the Manage Server permission to do that.");
    }
}

export function describeError(error: unknown, logger: Logger): string {
    if (error instanceof UserFacingError) {
        return error.message;
    }
    if (error instanceof PlatformApiError) {
        if (error.status >= 500) {
            logger.error({ err: error }, "platform api failure");
            return "The platform is having trouble right now. Try again in a moment.";
        }
        return error.message;
    }
    logger.error({ err: error }, "interaction failed");
    return "Something went wrong. Try again in a moment.";
}

export async function replyWithError(
    interaction: ChatInputCommandInteraction | ComponentInteraction,
    error: unknown,
    logger: Logger
): Promise<void> {
    const payload = notice(describeError(error, logger), Accent.Danger);
    if (interaction.deferred && !interaction.replied) {
        // edit existing deferred placeholder so the spinner terminates
        await interaction.editReply(payload).catch(() => undefined);
    } else if (interaction.replied) {
        await interaction.followUp(payload).catch(() => undefined);
    } else {
        await interaction.reply(payload).catch(() => undefined);
    }
}
