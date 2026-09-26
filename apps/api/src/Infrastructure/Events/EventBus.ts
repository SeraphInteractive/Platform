import type { RaidSeverity } from "@platform/scoring";

export enum RoundEventType {
    BallotSubmitted = "ballot.submitted",
    RaidAlert = "raid.alert",
    RoundFinalized = "round.finalized"
}

export interface BallotSubmittedEvent {
    readonly type: RoundEventType.BallotSubmitted;
    readonly roundId: string;
    readonly entryIds: readonly string[];
    readonly occurredAt: string;
}

export interface RaidAlertEvent {
    readonly type: RoundEventType.RaidAlert;
    readonly roundId: string;
    readonly entryId: string;
    readonly severity: RaidSeverity;
    readonly compositeScore: number;
    readonly occurredAt: string;
}

export interface RoundFinalizedEvent {
    readonly type: RoundEventType.RoundFinalized;
    readonly roundId: string;
    readonly resultId: string;
    readonly occurredAt: string;
}

export type RoundEvent = BallotSubmittedEvent | RaidAlertEvent | RoundFinalizedEvent;

export type RoundEventHandler = (event: RoundEvent) => void;

export type Unsubscribe = () => Promise<void>;

export interface EventBus {
    publish(event: RoundEvent): Promise<void>;
    subscribeToRound(roundId: string, handler: RoundEventHandler): Promise<Unsubscribe>;
    close(): Promise<void>;
}

export function roundChannel(roundId: string): string {
    return `platform:round-events:${roundId}`;
}

const knownEventTypes: ReadonlySet<string> = new Set(Object.values(RoundEventType));

export function parseRoundEvent(payload: string): RoundEvent | null {
    try {
        const parsed: unknown = JSON.parse(payload);
        if (parsed !== null && typeof parsed === "object" && knownEventTypes.has(String((parsed as { type?: unknown }).type))) {
            return parsed as RoundEvent;
        }
    } catch {
        return null;
    }
    return null;
}
