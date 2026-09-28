import { ActivityType, Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { NotificationConsumer } from "./Api/NotificationConsumer.js";
import { PlatformApiClient } from "./Api/PlatformApiClient.js";
import type { BotContext } from "./Commands/Command.js";
import { createLogger } from "./Common/Logger.js";
import { ConfigurationError, loadBotConfiguration } from "./Configuration/BotConfiguration.js";
import { InteractionRouter, slashCommands } from "./Interactions/InteractionRouter.js";
import { NotificationDispatcher } from "./Services/NotificationDispatcher.js";
import { ReminderScheduler } from "./Services/ReminderScheduler.js";
import { ServerProvisioner } from "./Services/ServerProvisioner.js";
import { TaskForum } from "./Services/TaskForum.js";
import { ReminderStore } from "./State/ReminderStore.js";
import { BoundRole, SettingsStore } from "./State/SettingsStore.js";

async function main(): Promise<void> {
    const configuration = loadBotConfiguration();
    const logger = createLogger(configuration.logLevel, configuration.logFormat === "pretty");
    const settings = new SettingsStore(configuration.dataDirectory);
    await settings.load();

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
    const api = new PlatformApiClient(configuration.apiBaseUrl, configuration.serviceToken, logger);
    const forum = new TaskForum(client, configuration.guildId, settings, api, logger);
    const dispatcher = new NotificationDispatcher(client, configuration.guildId, settings, forum, logger);
    const consumer = new NotificationConsumer(api, settings, (notification) => dispatcher.handle(notification), logger);
    const provisioner = new ServerProvisioner(settings, logger);
    const reminders = new ReminderStore(configuration.dataDirectory);
    await reminders.load();
    const reminderScheduler = new ReminderScheduler(client, reminders, logger);
    const context: BotContext = { configuration, api, settings, forum, provisioner, consumer, reminders, reminderScheduler, logger };
    const router = new InteractionRouter(context);

    await new REST({ version: "10" })
        .setToken(configuration.discordToken)
        .put(Routes.applicationGuildCommands(configuration.clientId, configuration.guildId), {
            body: slashCommands.map((command) => command.definition)
        });
    logger.info({ count: slashCommands.length }, "slash commands registered");

    client.once(Events.ClientReady, (ready) => {
        void (async (): Promise<void> => {
            logger.info({ user: ready.user.tag }, "connected to discord");
            ready.user.setPresence({ activities: [{ name: "voting rounds", type: ActivityType.Watching }], status: "online" });
            const guild = await ready.guilds.fetch(configuration.guildId).catch(() => null);
            if (guild === null) {
                logger.error({ guild: configuration.guildId }, "the bot is not a member of its configured server");
                return;
            }
            await provisioner.bindExisting(guild).catch((error: unknown) => {
                logger.warn({ err: error }, "failed to bind existing channels");
            });
            await forum.load().catch((error: unknown) => {
                logger.warn({ err: error }, "failed to load task thread bindings");
            });
            consumer.start();
            reminderScheduler.start();
        })();
    });

    client.on(Events.InteractionCreate, (interaction) => {
        void router.route(interaction);
    });

    client.on(Events.GuildMemberAdd, (member) => {
        const roleId = settings.role(BoundRole.Observer);
        if (member.guild.id !== configuration.guildId || roleId === undefined) {
            return;
        }
        member.roles.add(roleId, "New member").catch((error: unknown) => {
            logger.warn({ err: error, member: member.id }, "failed to grant observer role");
        });
    });

    client.on(Events.Error, (error) => {
        logger.error({ err: error }, "discord client error");
    });

    let stopping = false;
    const shutdown = (signal: string): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info({ signal }, "shutting down");
        consumer.stop();
        reminderScheduler.stop();
        void client.destroy().finally(() => process.exit(0));
    };
    process.once("SIGTERM", () => {
        shutdown("SIGTERM");
    });
    process.once("SIGINT", () => {
        shutdown("SIGINT");
    });
    process.on("unhandledRejection", (reason: unknown) => {
        logger.error({ err: reason }, "unhandled promise rejection");
    });

    await client.login(configuration.discordToken);
}

main().catch((error: unknown) => {
    if (error instanceof ConfigurationError) {
        process.stderr.write(`${error.message}\n`);
    } else {
        process.stderr.write(`Fatal startup error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    }
    process.exit(1);
});
