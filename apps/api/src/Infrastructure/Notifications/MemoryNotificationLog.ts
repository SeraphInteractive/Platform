import { EventEmitter } from "node:events";
import { compareStreamIds, type NotificationLog, type NotificationLogEntry, type NotificationReader } from "./NotificationLog.js";

class MemoryNotificationReader implements NotificationReader {
    private closed = false;

    public constructor(
        private readonly entries: readonly NotificationLogEntry[],
        private readonly appended: EventEmitter
    ) {}

    public async read(afterId: string, count: number, blockMs: number): Promise<NotificationLogEntry[]> {
        if (this.isClosed()) {
            return [];
        }
        const immediate = this.pending(afterId, count);
        if (immediate.length > 0) {
            return immediate;
        }
        await new Promise<void>((resolve) => {
            const done = (): void => {
                clearTimeout(timer);
                this.appended.off("entry", done);
                resolve();
            };
            const timer = setTimeout(done, blockMs);
            this.appended.on("entry", done);
        });
        return this.isClosed() ? [] : this.pending(afterId, count);
    }

    public close(): Promise<void> {
        this.closed = true;
        this.appended.emit("entry");
        return Promise.resolve();
    }

    private isClosed(): boolean {
        return this.closed;
    }

    private pending(afterId: string, count: number): NotificationLogEntry[] {
        return this.entries.filter((entry) => compareStreamIds(entry.id, afterId) > 0).slice(0, count);
    }
}

export class MemoryNotificationLog implements NotificationLog {
    public readonly entries: NotificationLogEntry[] = [];
    private readonly appended = new EventEmitter();
    private sequence = 0;

    public append(payload: string): Promise<string> {
        this.sequence++;
        const id = `${this.sequence}-0`;
        this.entries.push({ id, payload });
        this.appended.emit("entry");
        return Promise.resolve(id);
    }

    public latestId(): Promise<string> {
        return Promise.resolve(this.entries.at(-1)?.id ?? "0-0");
    }

    public openReader(): NotificationReader {
        return new MemoryNotificationReader(this.entries, this.appended);
    }
}
