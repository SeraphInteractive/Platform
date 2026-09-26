import type { NotificationPerson, PlatformNotification, RoundReference, ShotReference } from "@platform/contracts";
import type { Actor } from "../../Common/Security/Principal.js";
import type { ShotRecord, UserRecord, VotingRoundRecord } from "../Database/Schema.js";

export { NotificationType } from "@platform/contracts";

export type NotificationInput = PlatformNotification extends infer Notification
    ? Notification extends PlatformNotification
        ? Omit<Notification, "occurredAt">
        : never
    : never;

export interface Notifier {
    notify(notification: NotificationInput): void;
}

export class NullNotifier implements Notifier {
    public notify(): void {
        return;
    }
}

export class RecordingNotifier implements Notifier {
    public readonly notifications: NotificationInput[] = [];

    public notify(notification: NotificationInput): void {
        this.notifications.push(notification);
    }
}

export function personOfActor(actor: Actor): NotificationPerson {
    return { discordId: actor.discordId, username: actor.displayName };
}

export function personOfUser(user: Pick<UserRecord, "discordId" | "discordUsername">): NotificationPerson {
    return { discordId: user.discordId, username: user.discordUsername };
}

export function roundReferenceOf(round: Pick<VotingRoundRecord, "id" | "title" | "pollType">): RoundReference {
    return { id: round.id, title: round.title, pollType: round.pollType };
}

export function shotReferenceOf(shot: Pick<ShotRecord, "id" | "shotCode" | "title" | "sceneNumber" | "difficultyTier">): ShotReference {
    return { id: shot.id, code: shot.shotCode, title: shot.title, sceneNumber: shot.sceneNumber, difficulty: shot.difficultyTier };
}
