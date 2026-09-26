import { PresenceStatus } from "@platform/contracts";
import { z } from "zod";
import type { KeyValueStore } from "../Cache/KeyValueStore.js";

export interface PresenceProvider {
    getPresence(discordIds: readonly string[]): Promise<Record<string, PresenceStatus>>;
}

const lanyardSchema = z.object({
    success: z.literal(true),
    data: z.object({ discord_status: z.enum(PresenceStatus) })
});

const cacheTtlSeconds = 30;

export class LanyardPresenceProvider implements PresenceProvider {
    public constructor(private readonly cache: KeyValueStore) {}

    public async getPresence(discordIds: readonly string[]): Promise<Record<string, PresenceStatus>> {
        const pairs = await Promise.all(
            discordIds.map(async (discordId): Promise<[string, PresenceStatus]> => [discordId, await this.resolve(discordId)])
        );
        return Object.fromEntries(pairs);
    }

    private async resolve(discordId: string): Promise<PresenceStatus> {
        if (!/^\d{17,20}$/u.test(discordId)) {
            return PresenceStatus.Offline;
        }
        const cacheKey = `presence:${discordId}`;
        const cached = await this.cache.get(cacheKey);
        if (cached !== null) {
            return cached as PresenceStatus;
        }
        const status = await this.fetchStatus(discordId);
        await this.cache.set(cacheKey, status, cacheTtlSeconds);
        return status;
    }

    private async fetchStatus(discordId: string): Promise<PresenceStatus> {
        try {
            const response = await fetch(`https://api.lanyard.rest/v1/users/${discordId}`, {
                redirect: "error",
                signal: AbortSignal.timeout(2000)
            });
            if (!response.ok) {
                await response.body?.cancel();
                return PresenceStatus.Offline;
            }
            const parsed = lanyardSchema.safeParse(await response.json());
            return parsed.success ? parsed.data.data.discord_status : PresenceStatus.Offline;
        } catch {
            return PresenceStatus.Offline;
        }
    }
}

export { PresenceStatus };
