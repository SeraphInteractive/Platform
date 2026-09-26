import type { FastifyBaseLogger } from "fastify";
import type { Notifier, NotificationInput } from "./Notification.js";

export interface NotificationLogEntry {
    readonly id: string;
    readonly payload: string;
}

export interface NotificationReader {
    read(afterId: string, count: number, blockMs: number): Promise<NotificationLogEntry[]>;
    close(): Promise<void>;
}

export interface NotificationLog {
    append(payload: string): Promise<string>;
    latestId(): Promise<string>;
    openReader(): NotificationReader;
}

export class StreamNotifier implements Notifier {
    public constructor(
        private readonly log: NotificationLog,
        private readonly logger: FastifyBaseLogger
    ) {}

    public notify(notification: NotificationInput): void {
        const payload = JSON.stringify({ ...notification, occurredAt: new Date().toISOString() });
        this.log.append(payload).catch((error: unknown) => {
            this.logger.error({ err: error, type: notification.type }, "failed to record notification");
        });
    }
}

export function compareStreamIds(left: string, right: string): number {
    const [leftTime = 0n, leftSequence = 0n] = left.split("-").map((part) => BigInt(part));
    const [rightTime = 0n, rightSequence = 0n] = right.split("-").map((part) => BigInt(part));
    if (leftTime !== rightTime) {
        return leftTime < rightTime ? -1 : 1;
    }
    if (leftSequence === rightSequence) {
        return 0;
    }
    return leftSequence < rightSequence ? -1 : 1;
}
