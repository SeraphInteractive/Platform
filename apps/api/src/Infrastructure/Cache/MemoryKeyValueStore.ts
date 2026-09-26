import type { KeyValueStore } from "./KeyValueStore.js";

interface MemoryItem {
    readonly value: string;
    readonly expiresAt: number;
}

export class MemoryKeyValueStore implements KeyValueStore {
    private readonly items = new Map<string, MemoryItem>();

    public get(key: string): Promise<string | null> {
        return Promise.resolve(this.read(key));
    }

    public set(key: string, value: string, ttlSeconds: number): Promise<void> {
        this.items.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        return Promise.resolve();
    }

    public setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
        if (this.read(key) !== null) {
            return Promise.resolve(false);
        }
        this.items.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
        return Promise.resolve(true);
    }

    public take(key: string): Promise<string | null> {
        const value = this.read(key);
        this.items.delete(key);
        return Promise.resolve(value);
    }

    public delete(key: string): Promise<void> {
        this.items.delete(key);
        return Promise.resolve();
    }

    public increment(key: string): Promise<number> {
        const next = Number(this.read(key) ?? "0") + 1;
        this.items.set(key, { value: String(next), expiresAt: Number.POSITIVE_INFINITY });
        return Promise.resolve(next);
    }

    public incrementWithin(key: string, windowSeconds: number): Promise<number> {
        const existing = this.items.get(key);
        const active = existing !== undefined && existing.expiresAt > Date.now();
        const next = active ? Number(existing.value) + 1 : 1;
        this.items.set(key, { value: String(next), expiresAt: active ? existing.expiresAt : Date.now() + windowSeconds * 1000 });
        return Promise.resolve(next);
    }

    public ping(): Promise<void> {
        return Promise.resolve();
    }

    private read(key: string): string | null {
        const item = this.items.get(key);
        if (item === undefined) {
            return null;
        }
        if (item.expiresAt <= Date.now()) {
            this.items.delete(key);
            return null;
        }
        return item.value;
    }
}
