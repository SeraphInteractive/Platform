import { z } from "zod";
import type { DiscordConfiguration } from "../../Configuration/ApplicationConfiguration.js";

export interface DiscordProfile {
    readonly id: string;
    readonly username: string;
    readonly avatar: string | null;
}

export interface DiscordOAuthClient {
    buildAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<string>;
    fetchProfile(accessToken: string): Promise<DiscordProfile>;
}

export class DiscordOAuthError extends Error {
    public constructor(
        message: string,
        public readonly status?: number
    ) {
        super(message);
        this.name = "DiscordOAuthError";
    }
}

const tokenResponseSchema = z.object({
    access_token: z.string().min(1),
    token_type: z.string()
});

const profileSchema = z.object({
    id: z.string().regex(/^\d{17,20}$/u),
    username: z.string().min(1).max(64),
    global_name: z.string().max(64).nullish(),
    avatar: z
        .string()
        .regex(/^(?:a_)?[a-f0-9]{32}$/u)
        .nullish()
});

const discordApiBase = "https://discord.com/api/v10";
const requestTimeoutMs = 8000;

export class HttpDiscordOAuthClient implements DiscordOAuthClient {
    public constructor(private readonly configuration: DiscordConfiguration) {}

    public buildAuthorizeUrl(state: string): string {
        const url = new URL("https://discord.com/oauth2/authorize");
        url.search = new URLSearchParams({
            client_id: this.configuration.clientId,
            redirect_uri: this.configuration.redirectUri,
            response_type: "code",
            scope: "identify",
            state,
            prompt: "none"
        }).toString();
        return url.toString();
    }

    public async exchangeCode(code: string): Promise<string> {
        const response = await fetch(`${discordApiBase}/oauth2/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: this.configuration.redirectUri,
                client_id: this.configuration.clientId,
                client_secret: this.configuration.clientSecret
            }),
            redirect: "error",
            signal: AbortSignal.timeout(requestTimeoutMs)
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new DiscordOAuthError("Discord rejected the authorization code.", response.status);
        }
        const parsed = tokenResponseSchema.safeParse(await response.json());
        if (!parsed.success || parsed.data.token_type.toLowerCase() !== "bearer") {
            throw new DiscordOAuthError("Discord returned an unexpected token response.");
        }
        return parsed.data.access_token;
    }

    public async fetchProfile(accessToken: string): Promise<DiscordProfile> {
        const response = await fetch(`${discordApiBase}/users/@me`, {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(requestTimeoutMs)
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new DiscordOAuthError("Discord profile could not be loaded.", response.status);
        }
        const parsed = profileSchema.safeParse(await response.json());
        if (!parsed.success) {
            throw new DiscordOAuthError("Discord returned an unexpected profile.");
        }
        return {
            id: parsed.data.id,
            username: parsed.data.global_name ?? parsed.data.username,
            avatar: parsed.data.avatar ?? null
        };
    }
}
