import { z } from "zod";
import { maximumSuperAdmins } from "../Domain/Roles.js";

const optionalString = z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

const snowflake = z.string().regex(/^\d{17,20}$/u, "must be a Discord snowflake");

const snowflakeList = z
    .string()
    .optional()
    .transform((value) =>
        (value ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
    )
    .pipe(z.array(snowflake));

const booleanFlag = z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((value) => value === "true" || value === "1");

const origin = z.url({ protocol: /^https?$/u }).transform((value, context) => {
    const parsed = new URL(value);
    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.username !== "" || parsed.password !== "") {
        context.addIssue({ code: "custom", message: "must be a bare origin such as https://app.example.com" });
        return z.NEVER;
    }
    return parsed.origin;
});

const environmentObject = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_FORMAT: z.enum(["json", "pretty"]).default("json"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    APP_URL: z.url({ protocol: /^https?$/u }),
    APP_KEY: z.string().min(32, "must be at least 32 characters"),
    CORS_ORIGINS: z
        .string()
        .transform((value) =>
            value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
        )
        .pipe(z.array(origin).min(1)),
    WEB_AUTH_CALLBACK_PATH: z
        .string()
        .regex(/^\/[A-Za-z0-9/_-]{0,127}$/u)
        .default("/auth/callback"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    SERVICE_TOKEN: z
        .string()
        .min(32, "must be at least 32 characters")
        .optional()
        .or(z.literal("").transform(() => undefined)),

    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_DATABASE: z.string().min(1),
    DB_SSL: z.enum(["disable", "require", "verify-full"]).default("disable"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

    REDIS_HOST: z.string().min(1),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
    REDIS_PASSWORD: optionalString,
    REDIS_TLS: booleanFlag,

    DISCORD_CLIENT_ID: snowflake,
    DISCORD_CLIENT_SECRET: z.string().min(1),
    DISCORD_REDIRECT_URI: z.url({ protocol: /^https?$/u }),

    SUPER_ADMIN_DISCORD_IDS: snowflakeList.pipe(
        z.array(snowflake).max(maximumSuperAdmins, `must list at most ${maximumSuperAdmins} users`)
    ),
    ADMIN_DISCORD_IDS: snowflakeList,
    SUPERVISOR_DISCORD_IDS: snowflakeList,
    MODERATOR_DISCORD_IDS: snowflakeList,
    SENIOR_DISCORD_IDS: snowflakeList,

    S3_ENDPOINT: z
        .url({ protocol: /^https?$/u })
        .optional()
        .or(z.literal("").transform(() => undefined)),
    S3_REGION: z.string().default("auto"),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_DELIVERABLES_BUCKET: optionalString,
    S3_MEDIA_BUCKET: optionalString,
    S3_MEDIA_PUBLIC_URL: z
        .url({ protocol: /^https$/u })
        .optional()
        .or(z.literal("").transform(() => undefined)),
    MEDIA_MAX_BYTES: z.coerce
        .number()
        .int()
        .min(1024)
        .default(5 * 1024 * 1024),
    DELIVERABLE_MAX_BYTES: z.coerce
        .number()
        .int()
        .min(1024)
        .default(2 * 1024 * 1024 * 1024)
});

export const databaseEnvironmentSchema = environmentObject.pick({
    DB_HOST: true,
    DB_PORT: true,
    DB_USER: true,
    DB_PASSWORD: true,
    DB_DATABASE: true,
    DB_SSL: true,
    DB_POOL_MAX: true
});

export const environmentSchema = environmentObject.superRefine((value, context) => {
    if (value.NODE_ENV !== "production") {
        return;
    }
    const insecure = [value.APP_URL, value.DISCORD_REDIRECT_URI, ...value.CORS_ORIGINS].filter((url) => url.startsWith("http:"));
    if (insecure.length > 0) {
        context.addIssue({ code: "custom", path: ["APP_URL"], message: `production URLs must use https: ${insecure.join(", ")}` });
    }
    if (value.REDIS_PASSWORD === undefined) {
        context.addIssue({ code: "custom", path: ["REDIS_PASSWORD"], message: "is required in production" });
    }
});

export type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentError extends Error {
    public constructor(public readonly issues: readonly string[]) {
        super(`Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
        this.name = "EnvironmentError";
    }
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
    const result = environmentSchema.safeParse(source);
    if (!result.success) {
        throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`));
    }
    return result.data;
}
