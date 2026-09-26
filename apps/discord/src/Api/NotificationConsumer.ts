import { platformNotificationSchema, type PlatformNotification } from "@platform/contracts";
import type { Logger } from "pino";
import type { SettingsStore } from "../State/SettingsStore.js";
import type { PlatformApiClient } from "./PlatformApiClient.js";

export type NotificationHandler = (notification: PlatformNotification) => Promise<void>;

interface ServerSentEvent {
    readonly id: string | null;
    readonly event: string;
    readonly data: string;
}

export interface ConsumerStatus {
    readonly connected: boolean;
    readonly lastEventAt: Date | null;
}

const minimumBackoffMs = 1000;
const maximumBackoffMs = 30_000;
const idleTimeoutMs = 60_000;

export function parseServerSentEvents(buffer: string): { events: ServerSentEvent[]; remainder: string } {
    const events: ServerSentEvent[] = [];
    const blocks = buffer.replace(/\r\n/gu, "\n").split("\n\n");
    const remainder = blocks.pop() ?? "";
    for (const block of blocks) {
        let id: string | null = null;
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
            if (line.startsWith(":") || line.length === 0) {
                continue;
            }
            const separator = line.indexOf(":");
            const field = separator < 0 ? line : line.slice(0, separator);
            const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /u, "");
            if (field === "id") {
                id = value;
            } else if (field === "event") {
                event = value;
            } else if (field === "data") {
                data.push(value);
            }
        }
        if (data.length > 0) {
            events.push({ id, event, data: data.join("\n") });
        }
    }
    return { events, remainder };
}

export class NotificationConsumer {
    private controller: AbortController | null = null;
    private running = false;
    private connected = false;
    private lastEventAt: Date | null = null;

    public constructor(
        private readonly api: PlatformApiClient,
        private readonly settings: SettingsStore,
        private readonly handler: NotificationHandler,
        private readonly logger: Logger
    ) {}

    public get status(): ConsumerStatus {
        return { connected: this.connected, lastEventAt: this.lastEventAt };
    }

    public start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        void this.run();
    }

    public stop(): void {
        this.running = false;
        this.controller?.abort();
    }

    private isRunning(): boolean {
        return this.running;
    }

    private async run(): Promise<void> {
        let backoff = minimumBackoffMs;
        while (this.running) {
            try {
                await this.consumeOnce();
                backoff = minimumBackoffMs;
            } catch (error: unknown) {
                if (!this.isRunning()) {
                    break;
                }
                this.logger.warn({ err: error, retryInMs: backoff }, "notification stream disconnected");
            }
            this.connected = false;
            if (this.isRunning()) {
                await new Promise((resolve) => setTimeout(resolve, backoff));
                backoff = Math.min(maximumBackoffMs, backoff * 2);
            }
        }
    }

    private async consumeOnce(): Promise<void> {
        this.controller = new AbortController();
        const response = await this.api.openNotificationStream(this.settings.notificationCursor, this.controller.signal);
        if (!response.ok || response.body === null) {
            await response.body?.cancel();
            throw new Error(`notification stream responded with ${response.status}`);
        }
        this.connected = true;
        this.logger.info({ resumeFrom: this.settings.notificationCursor }, "notification stream connected");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let idleTimer = this.armIdleTimer();
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) {
                    return;
                }
                clearTimeout(idleTimer);
                idleTimer = this.armIdleTimer();
                buffer += decoder.decode(chunk.value as Uint8Array, { stream: true });
                if (buffer.length > 1_000_000) {
                    throw new Error("notification stream buffer overflow");
                }
                const parsed = parseServerSentEvents(buffer);
                buffer = parsed.remainder;
                for (const event of parsed.events) {
                    await this.dispatch(event);
                }
            }
        } finally {
            clearTimeout(idleTimer);
            await reader.cancel().catch(() => undefined);
        }
    }

    private armIdleTimer(): NodeJS.Timeout {
        return setTimeout(() => this.controller?.abort(), idleTimeoutMs);
    }

    private async dispatch(event: ServerSentEvent): Promise<void> {
        if (event.event !== "notification" || event.id === null) {
            return;
        }
        this.lastEventAt = new Date();
        let payload: unknown;
        try {
            payload = JSON.parse(event.data);
        } catch {
            payload = null;
        }
        const notification = platformNotificationSchema.safeParse(payload);
        if (notification.success) {
            try {
                await this.handler(notification.data);
            } catch (error: unknown) {
                this.logger.error({ err: error, type: notification.data.type, id: event.id }, "notification handler failed");
            }
        } else {
            this.logger.warn({ id: event.id }, "skipping notification that does not match the contract");
        }
        const id = event.id;
        await this.settings.update((settings) => {
            settings.notificationCursor = id;
        });
    }
}
