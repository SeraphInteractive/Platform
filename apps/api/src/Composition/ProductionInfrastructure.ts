import type { FastifyBaseLogger } from "fastify";
import { Redis, type RedisOptions } from "ioredis";
import type { ApplicationConfiguration } from "../Configuration/ApplicationConfiguration.js";
import { RedisKeyValueStore } from "../Infrastructure/Cache/RedisKeyValueStore.js";
import { createPostgresConnection } from "../Infrastructure/Database/Database.js";
import { HttpDiscordOAuthClient } from "../Infrastructure/Discord/DiscordOAuthClient.js";
import { LanyardPresenceProvider } from "../Infrastructure/Discord/PresenceProvider.js";
import { RedisEventBus } from "../Infrastructure/Events/RedisEventBus.js";
import { StreamNotifier } from "../Infrastructure/Notifications/NotificationLog.js";
import { RedisNotificationLog } from "../Infrastructure/Notifications/RedisNotificationLog.js";
import { S3ObjectStorage } from "../Infrastructure/Storage/S3ObjectStorage.js";
import type { Infrastructure } from "./ServiceContainer.js";

export function createProductionInfrastructure(configuration: ApplicationConfiguration, logger: FastifyBaseLogger): Infrastructure {
    const connection = createPostgresConnection(configuration.database);
    const redisOptions: RedisOptions = {
        host: configuration.redis.host,
        port: configuration.redis.port,
        password: configuration.redis.password,
        tls: configuration.redis.tls ? {} : undefined,
        connectionName: "platform-api",
        maxRetriesPerRequest: 2,
        enableOfflineQueue: true,
        connectTimeout: 5000,
        commandTimeout: 3000
    };
    const redis = new Redis(redisOptions);
    const subscriber = new Redis({
        ...redisOptions,
        commandTimeout: undefined,
        connectionName: "platform-api-events",
        maxRetriesPerRequest: null
    });
    for (const client of [redis, subscriber]) {
        client.on("error", (error: Error) => {
            logger.error({ err: error }, "redis connection error");
        });
    }

    const keyValueStore = new RedisKeyValueStore(redis);
    const eventBus = new RedisEventBus(redis, subscriber);
    const notificationLog = new RedisNotificationLog(redis);

    return {
        database: connection.database,
        databasePing: () => connection.ping(),
        keyValueStore,
        eventBus,
        objectStorage: new S3ObjectStorage(configuration.storage),
        discordOAuth: new HttpDiscordOAuthClient(configuration.discord),
        presenceProvider: new LanyardPresenceProvider(keyValueStore),
        notifier: new StreamNotifier(notificationLog, logger),
        notificationLog,
        rateLimitRedis: redis,
        dispose: async (): Promise<void> => {
            await eventBus.close();
            await redis.quit();
            await connection.close();
        }
    };
}
