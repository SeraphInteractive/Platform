import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/u, "must be a Discord snowflake");
const optionalSnowflake = z.preprocess((val) => (val === "" ? undefined : val), snowflake.optional());
const optionalUrl = z.preprocess((val) => (val === "" ? undefined : val), z.string().url().optional());

const environmentSchema = z
    .object({
        NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
        LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
        LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
        DISCORD_BOT_TOKEN: z.string().min(50),
        DISCORD_CLIENT_ID: snowflake,
        DISCORD_GUILD_ID: snowflake,
        DISCORD_ANNOUNCEMENTS_CHANNEL_ID: optionalSnowflake,
        DISCORD_TELEMETRY_WEBHOOK_URL: optionalUrl,
        DISCORD_TASK_LOGS_WEBHOOK_URL: optionalUrl,
        DISCORD_MODERATION_LOGS_WEBHOOK_URL: optionalUrl,
        DISCORD_RULES_WEBHOOK_URL: optionalUrl,
        API_BASE_URL: z.url({ protocol: /^https?$/u }).transform((value) => value.replace(/\/+$/u, "")),
        SERVICE_TOKEN: z.string().min(32, "must be at least 32 characters"),
        WEB_APP_URL: z.url({ protocol: /^https?$/u }).transform((value) => value.replace(/\/+$/u, "")),
        DATA_DIRECTORY: z.string().min(1).default("/app/data")
    })
    .superRefine((value, context) => {
        if (
            value.NODE_ENV === "production" &&
            value.API_BASE_URL.startsWith("http:") &&
            !/^http:\/\/(api|localhost|127\.0\.0\.1)(:\d+)?\//u.test(`${value.API_BASE_URL}/`)
        ) {
            context.addIssue({ code: "custom", path: ["API_BASE_URL"], message: "must use https unless it is an internal address" });
        }
    });

export interface BotConfiguration {
    readonly environment: "development" | "production" | "test";
    readonly logLevel: string;
    readonly logFormat: "json" | "pretty";
    readonly discordToken: string;
    readonly clientId: string;
    readonly guildId: string;
    readonly announcementsChannelId?: string;
    readonly telemetryWebhookUrl?: string;
    readonly taskLogsWebhookUrl?: string;
    readonly moderationLogsWebhookUrl?: string;
    readonly rulesWebhookUrl?: string;
    readonly apiBaseUrl: string;
    readonly serviceToken: string;
    readonly webAppUrl: string;
    readonly dataDirectory: string;
}

export class ConfigurationError extends Error {
    public constructor(public readonly issues: readonly string[]) {
        super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
        this.name = "ConfigurationError";
    }
}

export function loadBotConfiguration(source: NodeJS.ProcessEnv = process.env): BotConfiguration {
    const result = environmentSchema.safeParse(source);
    if (!result.success) {
        throw new ConfigurationError(result.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`));
    }
    const environment = result.data;
    return {
        environment: environment.NODE_ENV,
        logLevel: environment.LOG_LEVEL,
        logFormat: environment.LOG_FORMAT,
        discordToken: environment.DISCORD_BOT_TOKEN,
        clientId: environment.DISCORD_CLIENT_ID,
        guildId: environment.DISCORD_GUILD_ID,
        announcementsChannelId: environment.DISCORD_ANNOUNCEMENTS_CHANNEL_ID,
        telemetryWebhookUrl: environment.DISCORD_TELEMETRY_WEBHOOK_URL,
        taskLogsWebhookUrl: environment.DISCORD_TASK_LOGS_WEBHOOK_URL,
        moderationLogsWebhookUrl: environment.DISCORD_MODERATION_LOGS_WEBHOOK_URL,
        rulesWebhookUrl: environment.DISCORD_RULES_WEBHOOK_URL,
        apiBaseUrl: environment.API_BASE_URL,
        serviceToken: environment.SERVICE_TOKEN,
        webAppUrl: environment.WEB_APP_URL,
        dataDirectory: environment.DATA_DIRECTORY
    };
}
