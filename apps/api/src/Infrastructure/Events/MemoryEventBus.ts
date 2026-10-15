import type { EventBus, RoundEvent, RoundEventHandler, ScriptEvent, ScriptEventHandler, Unsubscribe } from "./EventBus.js";

export class MemoryEventBus implements EventBus {
    private readonly handlers = new Map<string, Set<RoundEventHandler>>();
    private readonly scriptHandlers = new Map<string, Set<ScriptEventHandler>>();
    public readonly published: RoundEvent[] = [];
    public readonly publishedScripts: ScriptEvent[] = [];

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

    public publishScript(event: ScriptEvent): Promise<void> {
        this.publishedScripts.push(event);
        for (const handler of this.scriptHandlers.get(event.scriptId) ?? []) {
            handler(event);
        }
        return Promise.resolve();
    }

    public subscribeToScript(scriptId: string, handler: ScriptEventHandler): Promise<Unsubscribe> {
        const set = this.scriptHandlers.get(scriptId) ?? new Set<ScriptEventHandler>();
        set.add(handler);
        this.scriptHandlers.set(scriptId, set);
        return Promise.resolve(() => {
            set.delete(handler);
            return Promise.resolve();
        });
    }

    public close(): Promise<void> {
        this.handlers.clear();
        this.scriptHandlers.clear();
        return Promise.resolve();
    }
}
