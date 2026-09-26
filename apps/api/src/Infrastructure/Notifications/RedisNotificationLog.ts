import type { Redis } from "ioredis";
import type { NotificationLog, NotificationLogEntry, NotificationReader } from "./NotificationLog.js";

const streamKey = "platform:notifications";
const retainedEntries = "50000";

type StreamReply = [string, [string, string[]][]][] | null;

function toEntries(reply: StreamReply): NotificationLogEntry[] {
    const entries: NotificationLogEntry[] = [];
    for (const [, items] of reply ?? []) {
        for (const [id, fields] of items) {
            const index = fields.indexOf("payload");
            const payload = index >= 0 ? fields[index + 1] : undefined;
            if (payload !== undefined) {
                entries.push({ id, payload });
            }
        }
    }
    return entries;
}

class RedisNotificationReader implements NotificationReader {
    public constructor(private readonly connection: Redis) {}

    public async read(afterId: string, count: number, blockMs: number): Promise<NotificationLogEntry[]> {
        const reply = await this.connection.xread("COUNT", count, "BLOCK", blockMs, "STREAMS", streamKey, afterId);
        return toEntries(reply);
    }

    public async close(): Promise<void> {
        this.connection.disconnect();
        return Promise.resolve();
    }
}

export class RedisNotificationLog implements NotificationLog {
    public constructor(private readonly redis: Redis) {}

    public async append(payload: string): Promise<string> {
        const id = await this.redis.xadd(streamKey, "MAXLEN", "~", retainedEntries, "*", "payload", payload);
        return id ?? "";
    }

    public async latestId(): Promise<string> {
        const [latest] = await this.redis.xrevrange(streamKey, "+", "-", "COUNT", 1);
        return latest?.[0] ?? "0-0";
    }

    public openReader(): NotificationReader {
        return new RedisNotificationReader(
            this.redis.duplicate({ connectionName: "platform-api-notifications", commandTimeout: undefined })
        );
    }
}
