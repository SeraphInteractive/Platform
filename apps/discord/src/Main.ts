import { Role } from "@platform/contracts";
import { ActivityType, Client, Events, GatewayIntentBits, REST, Routes, type SendableChannels } from "discord.js";
import { NotificationConsumer } from "./Api/NotificationConsumer.js";
import { PlatformApiClient } from "./Api/PlatformApiClient.js";
import type { BotContext } from "./Commands/Command.js";
import { createLogger } from "./Common/Logger.js";
import { ConfigurationError, loadBotConfiguration } from "./Configuration/BotConfiguration.js";
import { Accent, message, panel } from "./Discord/Ui.js";
import { InteractionRouter, slashCommands } from "./Interactions/InteractionRouter.js";
import { NotificationDispatcher } from "./Services/NotificationDispatcher.js";
import { ReminderScheduler } from "./Services/ReminderScheduler.js";
import { RoleReconciliationService } from "./Services/RoleReconciliationService.js";
import { RoleSyncScheduler } from "./Services/RoleSyncScheduler.js";
import { ProfanityFilter } from "./Services/ProfanityFilter.js";
import { ServerProvisioner } from "./Services/ServerProvisioner.js";
import { syncMemberStudioRoles } from "./Services/StudioRoles.js";
import { TaskForum } from "./Services/TaskForum.js";
import { ReminderStore } from "./State/ReminderStore.js";
import { ChannelPurpose, SettingsStore } from "./State/SettingsStore.js";
import { WarningStore } from "./State/WarningStore.js";

async function main(): Promise<void> {
    const configuration = loadBotConfiguration();
    const logger = createLogger(configuration.logLevel, configuration.logFormat === "pretty");
    const settings = new SettingsStore(configuration.dataDirectory);
    await settings.load();

    const warnings = new WarningStore(configuration.dataDirectory);
    await warnings.load();

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });
    const api = new PlatformApiClient(configuration.apiBaseUrl, configuration.serviceToken, logger);
    const forum = new TaskForum(client, configuration.guildId, settings, api, logger);
    const dispatcher = new NotificationDispatcher(client, configuration.guildId, settings, forum, logger);
    const consumer = new NotificationConsumer(api, settings, (notification) => dispatcher.handle(notification), logger);
    const provisioner = new ServerProvisioner(settings, logger);
    const reminders = new ReminderStore(configuration.dataDirectory);
    await reminders.load();
    const reminderScheduler = new ReminderScheduler(client, reminders, logger);
    const roleReconciler = new RoleReconciliationService(api, provisioner, settings, client, logger);
    const roleScheduler = new RoleSyncScheduler(roleReconciler, configuration.guildId, client, logger);
    const profanityFilter = new ProfanityFilter(client, configuration.guildId, settings, warnings, logger, api);
    const context: BotContext = {
        configuration,
        api,
        settings,
        forum,
        provisioner,
        consumer,
        reminders,
        reminderScheduler,
        roleReconciler,
        roleScheduler,
        warnings,
        profanityFilter,
        logger
    };
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
            roleScheduler.start();
            profanityFilter.start();
            if (client.ws.ping >= 0) {
                void api.sendHeartbeat(client.ws.ping);
            }
            heartbeatTimer = setInterval(() => {
                if (client.ws.ping >= 0) {
                    void api.sendHeartbeat(client.ws.ping);
                }
            }, 10_000);
        })();
    });

    client.on(Events.InteractionCreate, (interaction) => {
        void router.route(interaction);
    });

    client.on(Events.MessageCreate, (msg) => {
        void profanityFilter.inspectMessage(msg);
    });

    client.on(Events.MessageUpdate, (_oldMsg, newMsg) => {
        void profanityFilter.inspectMessage(newMsg);
    });

    client.on(Events.GuildMemberAdd, (member) => {
        void (async (): Promise<void> => {
            if (member.guild.id !== configuration.guildId) {
                return;
            }
            try {
                const user = await api.getUserByDiscordId(member.id);
                if (user?.isBlacklisted) {
                    await member.ban({ reason: (user.blacklistReason ?? "Blacklisted on platform").slice(0, 500) });
                    logger.info({ member: member.id }, "banned blacklisted member upon joining");
                    return;
                }
                if (user !== null) {
                    await syncMemberStudioRoles(member, user.role, user.specialties, "Member joined/rejoined");
                } else {
                    // auto-grant base member role to new joiners
                    await syncMemberStudioRoles(member, Role.Member, [], "New member joined Discord");
                }

                // prefer dedicated welcome channel; fall back to announcements if unconfigured
                const welcomeChannelId = settings.channel(ChannelPurpose.Welcome) ?? settings.channel(ChannelPurpose.Announcements);
                if (welcomeChannelId !== undefined) {
                    const channel = await client.channels.fetch(welcomeChannelId).catch(() => null);
                    if (channel?.isSendable() && !channel.isDMBased() && channel.guildId === member.guild.id) {
                        await channel
                            .send({
                                content: `Welcome <@${member.id}> to the studio! Sign in at ${configuration.webAppUrl} to get started.`,
                                allowedMentions: { users: [member.id] }
                            })
                            .catch(() => undefined);
                    }
                }
            } catch (error: unknown) {
                logger.warn({ err: error, member: member.id }, "failed to handle member add");
            }
        })();
    });

    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
        void (async (): Promise<void> => {
            if (newMember.guild.id !== configuration.guildId) {
                return;
            }

            // detect when timeout was removed via Discord client UI
            const wasTimedOut =
                oldMember.communicationDisabledUntilTimestamp !== null && oldMember.communicationDisabledUntilTimestamp > Date.now();
            const isNowTimedOut =
                newMember.communicationDisabledUntilTimestamp !== null && newMember.communicationDisabledUntilTimestamp > Date.now();

            if (wasTimedOut && !isNowTimedOut) {
                const record = warnings.getRecord(newMember.id);
                if (record !== undefined && record.offenceLevel > 0) {
                    const updated = warnings.stepDownStage(newMember.id);
                    logger.info(
                        { userId: newMember.id, newStage: updated.offenceLevel },
                        "timeout removed via Discord client, stepped down offence stage"
                    );

                    const modChannelId = settings.channel(ChannelPurpose.ModerationLogs);
                    if (modChannelId !== undefined) {
                        const ch = await client.channels.fetch(modChannelId).catch(() => null);
                        if (ch !== null && ch.isSendable() && !ch.isDMBased()) {
                            await (ch as SendableChannels)
                                .send(
                                    message(
                                        panel(
                                            Accent.Info,
                                            "**Timeout Removed in Discord Client**",
                                            `**Member:** <@${newMember.id}>\n` +
                                                `**Status:** Built-in timeout removed. Offence level stepped down to Stage ${updated.offenceLevel}.\n` +
                                                `**Stage Warnings:** Reset to 0`
                                        )
                                    )
                                )
                                .catch(() => undefined);
                        }
                    }
                }
            }
        })();
    });

    client.on(Events.Error, (error) => {
        logger.error({ err: error }, "discord client error");
    });

    let heartbeatTimer: NodeJS.Timeout | undefined;
    let stopping = false;
    const shutdown = (signal: string): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        logger.info({ signal }, "shutting down");
        if (heartbeatTimer !== undefined) {
            clearInterval(heartbeatTimer);
        }
        consumer.stop();
        reminderScheduler.stop();
        roleScheduler.stop();
        profanityFilter.stop();
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
