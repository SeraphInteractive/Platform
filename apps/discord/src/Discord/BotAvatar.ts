import type { Client } from "discord.js";

// resolve live bot avatar url directly from discord client user
export function resolveBotAvatarUrl(client: Client): string | undefined {
    return client.user?.displayAvatarURL({ size: 256 });
}
