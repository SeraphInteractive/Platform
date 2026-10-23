import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "discord.js";

import { fileURLToPath } from "node:url";

export function loadBotAvatar(): Buffer | undefined {
    const candidates = [
        fileURLToPath(new URL("../../assets/bot-pfp.png", import.meta.url)),
        join(process.cwd(), "assets", "bot-pfp.png"),
        join(process.cwd(), "assets", "bot-pfp-temp.png"),
        join(process.cwd(), "apps", "discord", "assets", "bot-pfp.png"),
        join(process.cwd(), "apps", "web", "public", "branding", "bot-pfp.png"),
        "/home/yierke/mnt/extra/BACKUP!!!/Videos/bot-pfp.png"
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            try {
                return readFileSync(candidate);
            } catch {
                // ignore unreadable avatar file
            }
        }
    }
    return undefined;
}

export const botAvatarBuffer = loadBotAvatar();

export function resolveBotAvatarUrl(client: Client, webAppUrl?: string): string | undefined {
    // only use discord cdn avatar if user has an explicit custom avatar hash set
    if (client.user?.avatar) {
        return client.user.displayAvatarURL({ size: 256 });
    }
    const base = webAppUrl ? webAppUrl.replace(/\/+$/u, "") : "https://dev-app.projectstairway.net";
    return `${base}/branding/bot-pfp.png`;
}
