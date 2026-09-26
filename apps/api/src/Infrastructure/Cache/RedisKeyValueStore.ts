import type { Redis } from "ioredis";
import type { KeyValueStore } from "./KeyValueStore.js";

export class RedisKeyValueStore implements KeyValueStore {
    public constructor(
        private readonly redis: Redis,
        private readonly prefix = "platform:"
    ) {}

    public async get(key: string): Promise<string | null> {
        return this.redis.get(this.prefix + key);
    }

    public async set(key: string, value: string, ttlSeconds: number): Promise<void> {
        await this.redis.set(this.prefix + key, value, "EX", ttlSeconds);
    }

    public async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.redis.set(this.prefix + key, value, "EX", ttlSeconds, "NX");
        return result === "OK";
    }

    public async take(key: string): Promise<string | null> {
        return this.redis.getdel(this.prefix + key);
    }

    public async delete(key: string): Promise<void> {
        await this.redis.del(this.prefix + key);
    }

    public async increment(key: string): Promise<number> {
        return this.redis.incr(this.prefix + key);
    }

    public async incrementWithin(key: string, windowSeconds: number): Promise<number> {
        const results = await this.redis
            .multi()
            .incr(this.prefix + key)
            .expire(this.prefix + key, windowSeconds, "NX")
            .exec();
        const count = results?.[0]?.[1];
        return typeof count === "number" ? count : 0;
    }

    public async ping(): Promise<void> {
        await this.redis.ping();
    }
}
