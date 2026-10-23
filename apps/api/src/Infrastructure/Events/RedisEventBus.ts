import type { Redis } from "ioredis";
import {
    parseRoundEvent,
    parseScriptEvent,
    roundChannel,
    scriptChannel,
    type EventBus,
    type RoundEvent,
    type RoundEventHandler,
    type ScriptEvent,
    type ScriptEventHandler,
    type Unsubscribe
} from "./EventBus.js";

export class RedisEventBus implements EventBus {
    private readonly handlers = new Map<string, Set<RoundEventHandler>>();
    private readonly scriptHandlers = new Map<string, Set<ScriptEventHandler>>();

    public constructor(
        private readonly publisher: Redis,
        private readonly subscriber: Redis
    ) {
        this.subscriber.on("message", (channel: string, message: string) => {
            this.dispatch(channel, message);
        });
    }

    public async publish(event: RoundEvent): Promise<void> {
        await this.publisher.publish(roundChannel(event.roundId), JSON.stringify(event));
    }

    public async subscribeToRound(roundId: string, handler: RoundEventHandler): Promise<Unsubscribe> {
        const channel = roundChannel(roundId);
        let channelHandlers = this.handlers.get(channel);
        if (channelHandlers === undefined) {
            channelHandlers = new Set();
            this.handlers.set(channel, channelHandlers);
            await this.subscriber.subscribe(channel);
        }
        channelHandlers.add(handler);

        return async (): Promise<void> => {
            const current = this.handlers.get(channel);
            if (current === undefined) {
                return;
            }
            current.delete(handler);
            if (current.size === 0) {
                this.handlers.delete(channel);
                await this.subscriber.unsubscribe(channel);
            }
        };
    }

    public async publishScript(event: ScriptEvent): Promise<void> {
        await this.publisher.publish(scriptChannel(event.scriptId), JSON.stringify(event));
    }

    public async subscribeToScript(scriptId: string, handler: ScriptEventHandler): Promise<Unsubscribe> {
        const channel = scriptChannel(scriptId);
        let channelHandlers = this.scriptHandlers.get(channel);
        if (channelHandlers === undefined) {
            channelHandlers = new Set();
            this.scriptHandlers.set(channel, channelHandlers);
            await this.subscriber.subscribe(channel);
        }
        channelHandlers.add(handler);

        return async (): Promise<void> => {
            const current = this.scriptHandlers.get(channel);
            if (current === undefined) {
                return;
            }
            current.delete(handler);
            if (current.size === 0) {
                this.scriptHandlers.delete(channel);
                await this.subscriber.unsubscribe(channel);
            }
        };
    }

    public async close(): Promise<void> {
        this.handlers.clear();
        this.scriptHandlers.clear();
        await this.subscriber.quit();
    }

    private dispatch(channel: string, message: string): void {
        if (channel.startsWith("platform:script-events:")) {
            const channelHandlers = this.scriptHandlers.get(channel);
            const event = parseScriptEvent(message);
            if (channelHandlers === undefined || event === null) {
                return;
            }
            for (const handler of channelHandlers) {
                handler(event);
            }
            return;
        }

        const channelHandlers = this.handlers.get(channel);
        const event = parseRoundEvent(message);
        if (channelHandlers === undefined || event === null) {
            return;
        }
        for (const handler of channelHandlers) {
            handler(event);
        }
    }
}
