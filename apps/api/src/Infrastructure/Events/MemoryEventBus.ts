import type { EventBus, RoundEvent, RoundEventHandler, Unsubscribe } from "./EventBus.js";

export class MemoryEventBus implements EventBus {
    private readonly handlers = new Map<string, Set<RoundEventHandler>>();
    public readonly published: RoundEvent[] = [];

    public publish(event: RoundEvent): Promise<void> {
        this.published.push(event);
        for (const handler of this.handlers.get(event.roundId) ?? []) {
            handler(event);
        }
        return Promise.resolve();
    }

    public subscribeToRound(roundId: string, handler: RoundEventHandler): Promise<Unsubscribe> {
        const set = this.handlers.get(roundId) ?? new Set<RoundEventHandler>();
        set.add(handler);
        this.handlers.set(roundId, set);
        return Promise.resolve(() => {
            set.delete(handler);
            return Promise.resolve();
        });
    }

    public close(): Promise<void> {
        this.handlers.clear();
        return Promise.resolve();
    }
}
