import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { pino } from "pino";
import { buildApplication } from "../../src/App.js";
import type { ApplicationConfiguration } from "../../src/Configuration/ApplicationConfiguration.js";
import { createServiceContainer, type ServiceContainer } from "../../src/Composition/ServiceContainer.js";
import { initialTermsVersion } from "@platform/contracts";
import { Role } from "../../src/Domain/Roles.js";
import { MemoryKeyValueStore } from "../../src/Infrastructure/Cache/MemoryKeyValueStore.js";
import type { Database } from "../../src/Infrastructure/Database/Database.js";
import * as schema from "../../src/Infrastructure/Database/Schema.js";
import { MemoryEventBus } from "../../src/Infrastructure/Events/MemoryEventBus.js";
import { MemoryNotificationLog } from "../../src/Infrastructure/Notifications/MemoryNotificationLog.js";
import {
    FakeCaptchaVerifier,
    FakeDiscordOAuthClient,
    FakeMailDomainChecker,
    FakeObjectStorage,
    FakePresenceProvider,
    RecordingEmailSender,
    RecordingNotifier
} from "./TestDoubles.js";

export const webOrigin = "https://app.example.test";
export const serviceToken = "service-token-for-integration-tests-0123456789";
export const adminDiscordId = "100000000000000001";

export const testConfiguration: ApplicationConfiguration = {
    environment: "test",
    server: { host: "127.0.0.1", port: 0, logLevel: "silent", logFormat: "json", trustProxyHops: 0 },
    security: {
        appUrl: "https://api.example.test",
        appKey: "test-app-key-that-is-at-least-32-characters-long",
        corsOrigins: [webOrigin, "https://preview.example.test"],
        webAuthCallbackPath: "/auth/callback",
        sessionTtlDays: 30,
        serviceToken,
        secureCookies: true
    },
    database: { host: "localhost", port: 5432, user: "test", password: "test", database: "test", ssl: "disable", poolMax: 1 },
    redis: { host: "localhost", port: 6379, password: undefined, tls: false },
    discord: {
        clientId: "100000000000000000",
        clientSecret: "secret",
        redirectUri: "https://api.example.test/api/v1/auth/discord/callback"
    },
    roleAssignments: { superAdmins: [], admins: [adminDiscordId], supervisors: [], moderators: [], seniorContributors: [] },
    storage: {
        endpoint: undefined,
        region: "auto",
        accessKeyId: undefined,
        secretAccessKey: undefined,
        deliverablesBucket: "deliverables",
        mediaBucket: "media",
        mediaPublicUrl: "https://media.test",
        mediaMaxBytes: 5 * 1024 * 1024,
        deliverableMaxBytes: 100 * 1024 * 1024
    },
    email: { resendApiKey: undefined, from: undefined },
    verification: { turnstileSecretKey: undefined }
};

export interface TestUser {
    readonly record: schema.UserRecord;
    readonly token: string;
    readonly headers: Record<string, string>;
}

export interface TestContext {
    readonly application: FastifyInstance;
    readonly services: ServiceContainer;
    readonly database: Database;
    readonly notifier: RecordingNotifier;
    readonly notificationLog: MemoryNotificationLog;
    readonly eventBus: MemoryEventBus;
    readonly storage: FakeObjectStorage;
    readonly discord: FakeDiscordOAuthClient;
    readonly emailSender: RecordingEmailSender;
    createUser(role: Role, overrides?: Partial<schema.UserRecord>): Promise<TestUser>;
    close(): Promise<void>;
}

let snowflakeCounter = 200_000_000_000_000_000n;

export function nextSnowflake(): string {
    snowflakeCounter += 1n;
    return snowflakeCounter.toString();
}

interface TestDatabase {
    readonly database: Database;
    ping(): Promise<void>;
    close(): Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

async function createTestDatabase(): Promise<TestDatabase> {
    const url = process.env.TEST_DATABASE_URL;
    if (url === undefined || url.length === 0) {
        const client = new PGlite();
        await migratePglite(drizzlePglite(client), { migrationsFolder });
        return {
            database: drizzlePglite(client, { schema }) as unknown as Database,
            ping: async () => {
                await client.query("SELECT 1");
            },
            close: () => client.close()
        };
    }

    const client = postgres(url, { max: Number(process.env.TEST_DATABASE_POOL ?? "4"), onnotice: () => undefined });
    await client.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    await migratePostgres(drizzlePostgres(client), { migrationsFolder });
    return {
        database: drizzlePostgres(client, { schema }),
        ping: async () => {
            await client`SELECT 1`;
        },
        close: () => client.end({ timeout: 5 })
    };
}

export async function createTestContext(): Promise<TestContext> {
    const testDatabase = await createTestDatabase();
    const database = testDatabase.database;

    const logger = pino({ level: "silent" });
    const notificationLog = new MemoryNotificationLog();
    const notifier = new RecordingNotifier(notificationLog, logger);
    const eventBus = new MemoryEventBus();
    const storage = new FakeObjectStorage();
    const discord = new FakeDiscordOAuthClient();
    const emailSender = new RecordingEmailSender();
    const services = createServiceContainer(
        testConfiguration,
        {
            database,
            databasePing: () => testDatabase.ping(),
            keyValueStore: new MemoryKeyValueStore(),
            eventBus,
            objectStorage: storage,
            discordOAuth: discord,
            presenceProvider: new FakePresenceProvider(),
            notifier,
            notificationLog,
            rateLimitRedis: undefined,
            emailSender,
            captchaVerifier: new FakeCaptchaVerifier(),
            mailDomainChecker: new FakeMailDomainChecker(),
            dispose: () => testDatabase.close()
        },
        logger,
        { raidMonitor: { debounceMs: 60_000, alertCooldownSeconds: 1 } }
    );
    const application = await buildApplication(services, logger);
    await application.ready();

    return {
        application,
        services,
        database,
        notifier,
        notificationLog,
        eventBus,
        storage,
        discord,
        emailSender,
        createUser: async (role, overrides = {}) => {
            const [record] = await database
                .insert(schema.users)
                .values({
                    discordId: nextSnowflake(),
                    discordUsername: `${role}-user`,
                    role,
                    termsVersion: initialTermsVersion,
                    termsAcceptedAt: new Date(),
                    emailVerifiedAt: role === Role.Member ? null : new Date(),
                    ...overrides
                })
                .returning();
            if (record === undefined) {
                throw new Error("user insert failed");
            }
            const { token } = await services.tokenService.issue(record.id);
            return { record, token, headers: { authorization: `Bearer ${token}` } };
        },
        close: async () => {
            await application.close();
            await services.dispose();
        }
    };
}

export function json<T = Record<string, unknown>>(response: LightMyRequestResponse): T {
    return response.json<T>();
}
