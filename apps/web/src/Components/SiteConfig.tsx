"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface SiteConfig {
    readonly discordGuildId: string | null;
    readonly discordInviteUrl: string | null;
    readonly turnstileSiteKey: string | null;
    readonly adminDiscordIds: readonly string[];
}

const SiteConfigContext = createContext<SiteConfig>({
    discordGuildId: null,
    discordInviteUrl: null,
    turnstileSiteKey: null,
    adminDiscordIds: []
});

export function SiteConfigProvider({ value, children }: { readonly value: SiteConfig; readonly children: ReactNode }): ReactNode {
    return <SiteConfigContext value={value}>{children}</SiteConfigContext>;
}

export function useSiteConfig(): SiteConfig {
    return useContext(SiteConfigContext);
}

export function discordThreadUrl(config: SiteConfig, threadId: string): string | null {
    return config.discordGuildId === null ? null : `https://discord.com/channels/${config.discordGuildId}/${threadId}`;
}

export function isAdminDiscordId(config: SiteConfig, discordId: string): boolean {
    return config.adminDiscordIds.includes(discordId.trim());
}
