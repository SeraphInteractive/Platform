import fs from "node:fs";
import path from "node:path";

export function getDiscordBotToken(): string | null {
    const envToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
    if (envToken && !envToken.includes("placeholder")) {
        return envToken.trim();
    }

    // fallback inspection of local environment files during development
    try {
        const candidateFiles = [
            path.resolve(process.cwd(), ".env.local"),
            path.resolve(process.cwd(), ".env"),
            path.resolve(process.cwd(), "../../.env"),
            path.resolve(process.cwd(), "../.env")
        ];
        for (const filePath of candidateFiles) {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");
                const match = content.match(/^DISCORD_BOT_TOKEN=([^\r\n]+)/m);
                if (match?.[1] && !match[1].includes("placeholder")) {
                    return match[1].trim();
                }
            }
        }
    } catch {}

    return envToken ?? null;
}

export async function fetchDiscordUser(
    discordId: string
): Promise<{ id: string; username: string; globalName?: string | null; avatar?: string | null } | null> {
    const token = getDiscordBotToken();
    if (!token) return null;

    try {
        const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: {
                Authorization: `Bot ${token}`
            }
        });

        if (!res.ok) return null;
        const data = await res.json();
        return {
            id: data.id,
            username: data.username,
            globalName: data.global_name,
            avatar: data.avatar
        };
    } catch {
        return null;
    }
}

export async function sendDiscordDm(recipientDiscordId: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const token = getDiscordBotToken();
    if (!token) {
        return { ok: false, error: "Discord bot token is not configured on the server." };
    }

    try {
        // open dm channel with target user
        const channelRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
            method: "POST",
            headers: {
                Authorization: `Bot ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ recipient_id: recipientDiscordId })
        });

        if (!channelRes.ok) {
            const err = await channelRes.json().catch(() => null);
            const detail = err?.message || channelRes.statusText;
            return { ok: false, error: `Could not open Discord DM channel: ${detail}` };
        }

        const channelData = await channelRes.json();
        const channelId = channelData.id;

        // send message into dm channel
        const messageRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bot ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ content })
        });

        if (!messageRes.ok) {
            const err = await messageRes.json().catch(() => null);
            const detail = err?.message || messageRes.statusText;
            return { ok: false, error: `Could not deliver Discord DM: ${detail}` };
        }

        return { ok: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error";
        return { ok: false, error: message };
    }
}
