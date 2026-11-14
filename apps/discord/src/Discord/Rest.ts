import type { RESTOptions } from "discord.js";

// bypass node 24 undici symbol headers crash in @discordjs/rest
const makeFetchRequest: NonNullable<RESTOptions["makeRequest"]> = async (url, init) => {
    return fetch(url, init as unknown as RequestInit) as unknown as Awaited<ReturnType<NonNullable<RESTOptions["makeRequest"]>>>;
};

export const discordRestOptions = {
    rest: {
        makeRequest: makeFetchRequest
    }
} as const;

export const discordRest = discordRestOptions.rest;

const allowedDiscordWebhookHosts = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);

export function isSafeDiscordWebhookUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:") {
            return false;
        }
        const host = url.hostname.toLowerCase();
        return allowedDiscordWebhookHosts.has(host) && url.pathname.startsWith("/api/webhooks/");
    } catch {
        return false;
    }
}
