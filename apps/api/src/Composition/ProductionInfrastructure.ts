import type { FastifyBaseLogger } from "fastify";
import { Redis, type RedisOptions } from "ioredis";
import type { ApplicationConfiguration } from "../Configuration/ApplicationConfiguration.js";
import { DisabledCaptchaVerifier, TurnstileVerifier } from "../Infrastructure/Captcha/TurnstileVerifier.js";
import type { EmailSender } from "../Infrastructure/Email/EmailSender.js";
import { LogEmailSender } from "../Infrastructure/Email/LogEmailSender.js";
import { DnsMailDomainChecker } from "../Infrastructure/Email/MailDomainChecker.js";
import { ResendEmailSender } from "../Infrastructure/Email/ResendEmailSender.js";
import type { KeyValueStore } from "../Infrastructure/Cache/KeyValueStore.js";
import { MemoryKeyValueStore } from "../Infrastructure/Cache/MemoryKeyValueStore.js";
import { RedisKeyValueStore } from "../Infrastructure/Cache/RedisKeyValueStore.js";
import { createPostgresConnection } from "../Infrastructure/Database/Database.js";
import { HttpDiscordOAuthClient } from "../Infrastructure/Discord/DiscordOAuthClient.js";
import { LanyardPresenceProvider } from "../Infrastructure/Discord/PresenceProvider.js";
import type { EventBus } from "../Infrastructure/Events/EventBus.js";
import { MemoryEventBus } from "../Infrastructure/Events/MemoryEventBus.js";
import { RedisEventBus } from "../Infrastructure/Events/RedisEventBus.js";
import { MemoryNotificationLog } from "../Infrastructure/Notifications/MemoryNotificationLog.js";
import { StreamNotifier, type NotificationLog } from "../Infrastructure/Notifications/NotificationLog.js";
import { RedisNotificationLog } from "../Infrastructure/Notifications/RedisNotificationLog.js";
import { S3ObjectStorage } from "../Infrastructure/Storage/S3ObjectStorage.js";
import { NextcloudWebDAVStorage } from "../Infrastructure/Storage/NextcloudWebDAVStorage.js";
import { HybridObjectStorage } from "../Infrastructure/Storage/HybridObjectStorage.js";
import type { Infrastructure } from "./ServiceContainer.js";

function createEmailSender(configuration: ApplicationConfiguration, logger: FastifyBaseLogger): EmailSender {
    const resend = new ResendEmailSender(configuration.email);
    return resend.isEnabled() || configuration.environment === "production" ? resend : new LogEmailSender(logger);
}

export const inMemoryRedisHost = "memory";

interface StateParts {
    readonly keyValueStore: KeyValueStore;
    readonly eventBus: EventBus;
    readonly notificationLog: NotificationLog;
    readonly rateLimitRedis: Redis | undefined;
    readonly close: () => Promise<void>;
}

function createInMemoryState(configuration: ApplicationConfiguration, logger: FastifyBaseLogger): StateParts {
    if (configuration.environment === "production") {
        throw new Error("REDIS_HOST=memory is only allowed outside production.");
    }
    logger.warn("using in-memory state instead of Redis; run a single API process and expect caches to reset on restart");
    const eventBus = new MemoryEventBus();
    return {
        keyValueStore: new MemoryKeyValueStore(),
        eventBus,
        notificationLog: new MemoryNotificationLog(Date.now()),
        rateLimitRedis: undefined,
        close: () => eventBus.close()
    };
}

function createRedisState(configuration: ApplicationConfiguration, logger: FastifyBaseLogger): StateParts {
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

    const eventBus = new RedisEventBus(redis, subscriber);
    return {
        keyValueStore: new RedisKeyValueStore(redis),
        eventBus,
        notificationLog: new RedisNotificationLog(redis),
        rateLimitRedis: redis,
        close: async (): Promise<void> => {
            await eventBus.close();
            await redis.quit();
        }
    };
}

export function createProductionInfrastructure(configuration: ApplicationConfiguration, logger: FastifyBaseLogger): Infrastructure {
    const connection = createPostgresConnection(configuration.database);
    const state =
        configuration.redis.host === inMemoryRedisHost
            ? createInMemoryState(configuration, logger)
            : createRedisState(configuration, logger);
    const { keyValueStore, eventBus, notificationLog } = state;

    const s3Storage = new S3ObjectStorage(configuration.storage);
    const nextcloudStorage = new NextcloudWebDAVStorage({
        url: configuration.storage.nextcloudUrl,
        username: configuration.storage.nextcloudUsername,
        password: configuration.storage.nextcloudPassword,
        basePath: configuration.storage.nextcloudBasePath,
        publicUrl: configuration.storage.nextcloudPublicUrl
    });
    // deliverables route strictly to nextcloud storage vault, never s3
    const deliverablesStorage = nextcloudStorage;
    const objectStorage = new HybridObjectStorage(deliverablesStorage, s3Storage);

    return {
        database: connection.database,
        databasePing: () => connection.ping(),
        keyValueStore,
        eventBus,
        objectStorage,
        discordOAuth: new HttpDiscordOAuthClient(configuration.discord),
        presenceProvider: new LanyardPresenceProvider(keyValueStore),
        notifier: new StreamNotifier(notificationLog, logger),
        notificationLog,
        rateLimitRedis: state.rateLimitRedis,
        emailSender: createEmailSender(configuration, logger),
        captchaVerifier:
            configuration.verification.turnstileSecretKey === undefined
                ? new DisabledCaptchaVerifier()
                : new TurnstileVerifier(
                      configuration.verification.turnstileSecretKey,
                      configuration.security.corsOrigins.map((origin) => new URL(origin).hostname),
                      logger
                  ),
        mailDomainChecker: new DnsMailDomainChecker(),
        dispose: async (): Promise<void> => {
            await state.close();
            await connection.close();
        }
    };
}
