"use client";

import { RaidSeverity } from "@platform/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";

const roundEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("ballot.submitted"), roundId: z.string(), entryIds: z.array(z.string()), occurredAt: z.string() }),
    z.object({
        type: z.literal("raid.alert"),
        roundId: z.string(),
        entryId: z.string(),
        severity: z.enum(RaidSeverity),
        compositeScore: z.number(),
        occurredAt: z.string()
    }),
    z.object({ type: z.literal("round.finalized"), roundId: z.string(), resultId: z.string(), occurredAt: z.string() })
]);

export type RoundEvent = z.infer<typeof roundEventSchema>;

export enum StreamState {
    Connecting = "connecting",
    Live = "live",
    Reconnecting = "reconnecting",
    Closed = "closed"
}

export interface RoundEventStream {
    readonly events: readonly RoundEvent[];
    readonly state: StreamState;
}

const maximumEvents = 100;

export function useRoundEvents(roundId: string, enabled: boolean): RoundEventStream {
    const [events, setEvents] = useState<RoundEvent[]>([]);
    const [state, setState] = useState<StreamState>(StreamState.Connecting);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        const source = new EventSource(`/api/v1/rounds/${encodeURIComponent(roundId)}/events`);
        const receive = (message: MessageEvent<string>): void => {
            let payload: unknown;
            try {
                payload = JSON.parse(message.data);
            } catch {
                return;
            }
            const parsed = roundEventSchema.safeParse(payload);
            if (parsed.success) {
                setEvents((current) => [parsed.data, ...current].slice(0, maximumEvents));
            }
        };
        source.onopen = (): void => {
            setState(StreamState.Live);
        };
        source.onerror = (): void => {
            setState(source.readyState === EventSource.CLOSED ? StreamState.Closed : StreamState.Reconnecting);
        };
        for (const type of ["ballot.submitted", "raid.alert", "round.finalized"]) {
            source.addEventListener(type, receive);
        }
        return () => {
            source.close();
        };
    }, [roundId, enabled]);

    return { events, state: enabled ? state : StreamState.Closed };
}
