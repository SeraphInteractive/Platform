import type { Environment } from "./Environment.js";

export type RuntimeEnvironment = "development" | "production" | "test";

export interface ServerConfiguration {
    readonly host: string;
    readonly port: number;
    readonly logLevel: string;
    readonly logFormat: "json" | "pretty";
    readonly trustProxyHops: number;
}

export interface SecurityConfiguration {
    readonly appUrl: string;
    readonly appKey: string;
    readonly corsOrigins: readonly string[];
    readonly webAuthCallbackPath: string;
    readonly sessionTtlDays: number;
    readonly serviceToken: string | undefined;
    readonly secureCookies: boolean;
}

export interface DatabaseConfiguration {
    readonly host: string;
    readonly port: number;
    readonly user: string;
    readonly password: string;
    readonly database: string;
    readonly ssl: "disable" | "require" | "verify-full";
    readonly poolMax: number;
}

export interface RedisConfiguration {
    readonly host: string;
    readonly port: number;
    readonly password: string | undefined;
    readonly tls: boolean;
}

export interface DiscordConfiguration {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
}

export interface RoleAssignmentConfiguration {
    readonly superAdmins: readonly string[];
    readonly admins: readonly string[];
    readonly supervisors: readonly string[];
    readonly moderators: readonly string[];
    readonly seniorContributors: readonly string[];
}

export interface StorageConfiguration {
    readonly endpoint: string | undefined;
    readonly region: string;
    readonly accessKeyId: string | undefined;
    readonly secretAccessKey: string | undefined;
    readonly deliverablesBucket: string | undefined;
    readonly mediaBucket: string | undefined;
    readonly mediaPublicUrl: string | undefined;
    readonly mediaMaxBytes: number;
    readonly deliverableMaxBytes: number;
}

export interface EmailConfiguration {
    readonly resendApiKey: string | undefined;
    readonly from: string | undefined;
}

export interface VerificationConfiguration {
    readonly turnstileSecretKey: string | undefined;
}

export interface ApplicationConfiguration {
    readonly environment: RuntimeEnvironment;
    readonly server: ServerConfiguration;
    readonly security: SecurityConfiguration;
    readonly database: DatabaseConfiguration;
    readonly redis: RedisConfiguration;
    readonly discord: DiscordConfiguration;
    readonly roleAssignments: RoleAssignmentConfiguration;
    readonly storage: StorageConfiguration;
    readonly email: EmailConfiguration;
    readonly verification: VerificationConfiguration;
}

export function createConfiguration(environment: Environment): ApplicationConfiguration {
    return {
        environment: environment.NODE_ENV,
        server: {
            host: environment.HOST,
            port: environment.PORT,
            logLevel: environment.LOG_LEVEL,
            logFormat: environment.LOG_FORMAT,
            trustProxyHops: environment.TRUST_PROXY_HOPS
        },
        security: {
            appUrl: environment.APP_URL,
            appKey: environment.APP_KEY,
            corsOrigins: environment.CORS_ORIGINS,
            webAuthCallbackPath: environment.WEB_AUTH_CALLBACK_PATH,
            sessionTtlDays: environment.SESSION_TTL_DAYS,
            serviceToken: environment.SERVICE_TOKEN,
            secureCookies: new URL(environment.APP_URL).protocol === "https:"
        },
        database: {
            host: environment.DB_HOST,
            port: environment.DB_PORT,
            user: environment.DB_USER,
            password: environment.DB_PASSWORD,
            database: environment.DB_DATABASE,
            ssl: environment.DB_SSL,
            poolMax: environment.DB_POOL_MAX
        },
        redis: {
            host: environment.REDIS_HOST,
            port: environment.REDIS_PORT,
            password: environment.REDIS_PASSWORD,
            tls: environment.REDIS_TLS
        },
        discord: {
            clientId: environment.DISCORD_CLIENT_ID,
            clientSecret: environment.DISCORD_CLIENT_SECRET,
            redirectUri: environment.DISCORD_REDIRECT_URI
        },
        roleAssignments: {
            superAdmins: environment.SUPER_ADMIN_DISCORD_IDS,
            admins: environment.ADMIN_DISCORD_IDS,
            supervisors: environment.SUPERVISOR_DISCORD_IDS,
            moderators: environment.MODERATOR_DISCORD_IDS,
            seniorContributors: environment.SENIOR_DISCORD_IDS
        },
        storage: {
            endpoint: environment.S3_ENDPOINT,
            region: environment.S3_REGION,
            accessKeyId: environment.S3_ACCESS_KEY_ID,
            secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
            deliverablesBucket: environment.S3_DELIVERABLES_BUCKET,
            mediaBucket: environment.S3_MEDIA_BUCKET,
            mediaPublicUrl: environment.S3_MEDIA_PUBLIC_URL,
            mediaMaxBytes: environment.MEDIA_MAX_BYTES,
            deliverableMaxBytes: environment.DELIVERABLE_MAX_BYTES
        },
        email: {
            resendApiKey: environment.RESEND_API_KEY,
            from: environment.EMAIL_FROM
        },
        verification: {
            turnstileSecretKey: environment.TURNSTILE_SECRET_KEY
        }
    };
}
