import type { FastifyBaseLogger } from "fastify";
import type { Redis } from "ioredis";
import type { ApplicationConfiguration } from "../Configuration/ApplicationConfiguration.js";
import type { KeyValueStore } from "../Infrastructure/Cache/KeyValueStore.js";
import type { Database } from "../Infrastructure/Database/Database.js";
import type { DiscordOAuthClient } from "../Infrastructure/Discord/DiscordOAuthClient.js";
import type { PresenceProvider } from "../Infrastructure/Discord/PresenceProvider.js";
import type { EventBus } from "../Infrastructure/Events/EventBus.js";
import type { Notifier } from "../Infrastructure/Notifications/Notification.js";
import type { NotificationLog } from "../Infrastructure/Notifications/NotificationLog.js";
import type { ObjectStorage } from "../Infrastructure/Storage/ObjectStorage.js";
import { AuthService } from "../Modules/Auth/AuthService.js";
import { TokenService } from "../Modules/Auth/TokenService.js";
import { BallotsService } from "../Modules/Ballots/BallotsService.js";
import { EntriesService } from "../Modules/Entries/EntriesService.js";
import { LeaderboardCache } from "../Modules/Leaderboards/LeaderboardCache.js";
import { LeaderboardService } from "../Modules/Leaderboards/LeaderboardService.js";
import { RoundsService } from "../Modules/Rounds/RoundsService.js";
import { ReviewsService } from "../Modules/Shots/ReviewsService.js";
import { ShotsService } from "../Modules/Shots/ShotsService.js";
import { RaidMonitor, type RaidMonitorOptions } from "../Modules/Telemetry/RaidMonitor.js";
import { UsersService } from "../Modules/Users/UsersService.js";

export interface Infrastructure {
    readonly database: Database;
    readonly databasePing: () => Promise<void>;
    readonly keyValueStore: KeyValueStore;
    readonly eventBus: EventBus;
    readonly objectStorage: ObjectStorage;
    readonly discordOAuth: DiscordOAuthClient;
    readonly presenceProvider: PresenceProvider;
    readonly notifier: Notifier;
    readonly notificationLog: NotificationLog;
    readonly rateLimitRedis: Redis | undefined;
    dispose(): Promise<void>;
}

export interface ServiceContainerOptions {
    readonly raidMonitor?: RaidMonitorOptions;
}

export interface ServiceContainer extends Infrastructure {
    readonly configuration: ApplicationConfiguration;
    readonly tokenService: TokenService;
    readonly authService: AuthService;
    readonly usersService: UsersService;
    readonly roundsService: RoundsService;
    readonly leaderboardService: LeaderboardService;
    readonly entriesService: EntriesService;
    readonly ballotsService: BallotsService;
    readonly raidMonitor: RaidMonitor;
    readonly shotsService: ShotsService;
    readonly reviewsService: ReviewsService;
}

export function createServiceContainer(
    configuration: ApplicationConfiguration,
    infrastructure: Infrastructure,
    logger: FastifyBaseLogger,
    options: ServiceContainerOptions = {}
): ServiceContainer {
    const { database, keyValueStore, eventBus, notifier, objectStorage } = infrastructure;
    const leaderboardCache = new LeaderboardCache(keyValueStore);
    const tokenService = new TokenService(database, configuration.security, logger);
    const raidMonitor = new RaidMonitor(database, keyValueStore, eventBus, notifier, leaderboardCache, logger, options.raidMonitor);

    return {
        ...infrastructure,
        dispose: async (): Promise<void> => {
            raidMonitor.stop();
            await infrastructure.dispose();
        },
        configuration,
        tokenService,
        authService: new AuthService(
            database,
            keyValueStore,
            infrastructure.discordOAuth,
            tokenService,
            configuration.security,
            configuration.roleAssignments,
            logger
        ),
        usersService: new UsersService(database, notifier, leaderboardCache),
        roundsService: new RoundsService(database, notifier, leaderboardCache),
        leaderboardService: new LeaderboardService(database, leaderboardCache, eventBus, notifier),
        entriesService: new EntriesService(database, notifier, objectStorage, configuration.storage, leaderboardCache),
        ballotsService: new BallotsService(database, keyValueStore, eventBus, notifier, raidMonitor, configuration.security.appKey),
        raidMonitor,
        shotsService: new ShotsService(database, notifier, objectStorage, configuration.storage),
        reviewsService: new ReviewsService(database, notifier, objectStorage)
    };
}
