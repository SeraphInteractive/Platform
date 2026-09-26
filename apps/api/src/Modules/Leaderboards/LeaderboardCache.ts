import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import type { Leaderboard } from "./LeaderboardTypes.js";

const generationKey = "leaderboard:generation";
const ttlSeconds = 10;

export class LeaderboardCache {
    public constructor(private readonly store: KeyValueStore) {}

    public async get(roundId: string): Promise<Leaderboard | null> {
        const cached = await this.store.get(await this.keyFor(roundId));
        return cached === null ? null : (JSON.parse(cached) as Leaderboard);
    }

    public async set(roundId: string, leaderboard: Leaderboard): Promise<void> {
        await this.store.set(await this.keyFor(roundId), JSON.stringify(leaderboard), ttlSeconds);
    }

    public async invalidateRound(roundId: string): Promise<void> {
        await this.store.delete(await this.keyFor(roundId));
    }

    public async invalidateAll(): Promise<void> {
        await this.store.increment(generationKey);
    }

    private async keyFor(roundId: string): Promise<string> {
        const generation = (await this.store.get(generationKey)) ?? "0";
        return `leaderboard:${generation}:${roundId}`;
    }
}
