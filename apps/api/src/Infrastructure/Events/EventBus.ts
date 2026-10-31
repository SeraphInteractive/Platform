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

export enum ScriptEventType {
    ScriptUpdated = "script.updated",
    VersionCreated = "script.version_created"
}

export interface ScriptUpdatedEvent {
    readonly type: ScriptEventType.ScriptUpdated;
    readonly scriptId: string;
    readonly userId: string;
    readonly updatedAt: string;
    readonly title?: string;
    readonly content?: unknown;
    readonly titlePage?: unknown;
    readonly wordCount?: number;
    readonly sceneCount?: number;
}

export interface ScriptVersionCreatedEvent {
    readonly type: ScriptEventType.VersionCreated;
    readonly scriptId: string;
    readonly versionId: string;
    readonly name: string;
    readonly userId: string;
    readonly occurredAt: string;
}

export type ScriptEvent = ScriptUpdatedEvent | ScriptVersionCreatedEvent;

export type ScriptEventHandler = (event: ScriptEvent) => void;

export type Unsubscribe = () => Promise<void>;

export interface EventBus {
    publish(event: RoundEvent): Promise<void>;
    subscribeToRound(roundId: string, handler: RoundEventHandler): Promise<Unsubscribe>;
    publishScript(event: ScriptEvent): Promise<void>;
    subscribeToScript(scriptId: string, handler: ScriptEventHandler): Promise<Unsubscribe>;
    close(): Promise<void>;
}

export function roundChannel(roundId: string): string {
    return `platform:round-events:${roundId}`;
}

export function scriptChannel(scriptId: string): string {
    return `platform:script-events:${scriptId}`;
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

const knownScriptEventTypes: ReadonlySet<string> = new Set(Object.values(ScriptEventType));

export function parseScriptEvent(payload: string): ScriptEvent | null {
    try {
        const parsed: unknown = JSON.parse(payload);
        if (parsed !== null && typeof parsed === "object" && knownScriptEventTypes.has(String((parsed as { type?: unknown }).type))) {
            return parsed as ScriptEvent;
        }
    } catch {
        return null;
    }
    return null;
}
