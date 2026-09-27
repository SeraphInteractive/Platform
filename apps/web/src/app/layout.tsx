import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "@/Components/Layout/AppShell";
import { Providers } from "@/Components/Providers";
import { SiteConfigProvider } from "@/Components/SiteConfig";
import { env } from "@/Server/Environment";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
    title: { default: "Project Stairway", template: "%s · Project Stairway" },
    description:
        "A Minecraft-inspired animated film made by its community. Vote on the story, claim production tasks and follow the roadmap.",
    robots: { index: false, follow: false }
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fafafa" },
        { media: "(prefers-color-scheme: dark)", color: "#1e1f22" }
    ]
};

export default async function RootLayout({ children }: { readonly children: ReactNode }): Promise<ReactNode> {
    const nonce = (await headers()).get("x-nonce") ?? undefined;
    const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
    const { DISCORD_GUILD_ID, DISCORD_INVITE_URL, TURNSTILE_SITE_KEY, ADMIN_DISCORD_IDS } = env();
    const siteConfig = {
        discordGuildId: DISCORD_GUILD_ID ?? null,
        discordInviteUrl: DISCORD_INVITE_URL ?? null,
        turnstileSiteKey: TURNSTILE_SITE_KEY ?? null,
        adminDiscordIds: ADMIN_DISCORD_IDS
    };
    return (
        <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
            <body className="min-h-dvh">
                <Providers nonce={nonce}>
                    <SiteConfigProvider value={siteConfig}>
                        <AppShell defaultOpen={sidebarOpen}>{children}</AppShell>
                    </SiteConfigProvider>
                </Providers>
            </body>
        </html>
    );
}
