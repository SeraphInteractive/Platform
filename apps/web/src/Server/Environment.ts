import "server-only";
import { z } from "zod";

const originSchema = z.url().transform((value) => new URL(value).origin);

function optional<T extends z.ZodType>(schema: T): z.ZodPreprocess<z.ZodOptional<T>> {
    return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

const environmentSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    WEB_APP_URL: originSchema,
    API_INTERNAL_URL: originSchema,
    API_PUBLIC_URL: originSchema,
    STORAGE_ORIGINS: z
        .string()
        .default("")
        .transform((value) =>
            value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
        )
        .pipe(z.array(originSchema)),
    DISCORD_GUILD_ID: optional(z.string().regex(/^\d{17,20}$/u)),
    DISCORD_INVITE_URL: optional(z.url({ protocol: /^https$/u })),
    TURNSTILE_SITE_KEY: optional(z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u))
});

export type WebEnvironment = z.infer<typeof environmentSchema>;

let cached: WebEnvironment | undefined;

export function env(): WebEnvironment {
    if (cached === undefined) {
        const parsed = environmentSchema.safeParse(process.env);
        if (!parsed.success) {
            const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
            throw new Error(`Invalid web environment: ${issues}`);
        }
        cached = parsed.data;
    }
    return cached;
}

export function isSecureDeployment(): boolean {
    return new URL(env().WEB_APP_URL).protocol === "https:";
}
