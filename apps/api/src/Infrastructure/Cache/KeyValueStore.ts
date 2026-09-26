export interface KeyValueStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    take(key: string): Promise<string | null>;
    delete(key: string): Promise<void>;
    increment(key: string): Promise<number>;
    incrementWithin(key: string, windowSeconds: number): Promise<number>;
    ping(): Promise<void>;
}
