"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SiteConfig {
    readonly discordGuildId: string | null;
    readonly discordInviteUrl: string | null;
    readonly turnstileSiteKey: string | null;
}

const SiteConfigContext = createContext<SiteConfig>({
    discordGuildId: null,
    discordInviteUrl: null,
    turnstileSiteKey: null
});

export function SiteConfigProvider({ value, children }: { readonly value: SiteConfig; readonly children: ReactNode }): ReactNode {
    return <SiteConfigContext value={value}>{children}</SiteConfigContext>;
}

export function useSiteConfig(): SiteConfig {
    return useContext(SiteConfigContext);
}

export function toDiscordAppInviteUrl(inviteUrl: string | null): string | null {
    if (inviteUrl === null) {
        return null;
    }
    const trimmed = inviteUrl.trim();
    if (trimmed.startsWith("discord://")) {
        return trimmed;
    }
    const match = trimmed.match(/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9_-]+)/u);
    if (match?.[1] !== undefined) {
        return `discord:///invite/${match[1]}`;
    }
    return trimmed;
}

export function discordThreadUrl(config: SiteConfig, threadId: string): string | null {
    return config.discordGuildId === null ? null : `https://discord.com/channels/${config.discordGuildId}/${threadId}`;
}
