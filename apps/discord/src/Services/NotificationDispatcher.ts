import { EntryStatus, NotificationType, ReviewDecision, ShotStatus, type PlatformNotification } from "@platform/contracts";
import type { Client, SendableChannels } from "discord.js";
import type { Logger } from "pino";
import { BoundRole, ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { renderNotification } from "../Views/NotificationViews.js";
import { reviewCard, threadUpdate } from "../Views/TaskViews.js";
import type { TaskForum } from "./TaskForum.js";

export class NotificationDispatcher {
    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly settings: SettingsStore,
        private readonly forum: TaskForum,
        private readonly logger: Logger
    ) {}

    public async handle(notification: PlatformNotification): Promise<void> {
        await this.applySideEffects(notification).catch((error: unknown) => {
            this.logger.warn({ err: error, type: notification.type }, "discord side effect failed");
        });
        for (const rendered of renderNotification(notification, this.forum)) {
            const channel = await this.channel(rendered.purpose);
            if (channel !== null) {
                await channel.send(rendered.message);
            }
        }
    }

    private async applySideEffects(notification: PlatformNotification): Promise<void> {
        switch (notification.type) {
            case NotificationType.ShotCreated:
                await this.forum.ensureThread(notification.shot, null, ShotStatus.Available);
                return;
            case NotificationType.ShotUpdated:
                await this.forum.rename(notification.shot);
                return;
            case NotificationType.ShotDeleted:
                await this.forum.remove(notification.shot.id);
                return;
            case NotificationType.ShotClaimed:
                await this.forum.setStatus(notification.shot.id, ShotStatus.Claimed);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                return;
            case NotificationType.ShotReleased:
            case NotificationType.ShotExpired:
                await this.forum.setStatus(notification.shot.id, ShotStatus.Available);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                return;
            case NotificationType.SubmissionCreated: {
                await this.forum.setStatus(notification.shot.id, ShotStatus.Submitted);
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                const reviews = await this.channel(ChannelPurpose.TaskSubmissions);
                await reviews?.send(reviewCard(notification, this.forum.threadFor(notification.shot.id)));
                return;
            }
            case NotificationType.SubmissionReviewed: {
                const approved = notification.decision === ReviewDecision.Approved;
                await this.forum.post(notification.shot.id, threadUpdate(notification));
                await this.forum.setStatus(notification.shot.id, approved ? ShotStatus.Approved : ShotStatus.Claimed);
                return;
            }
            case NotificationType.EntryStatusChanged:
                if (
                    notification.status === EntryStatus.Approved &&
                    notification.author !== null &&
                    notification.author.discordId !== null
                ) {
                    await this.grantRole(
                        notification.author.discordId,
                        BoundRole.Contributor,
                        `Entry "${notification.entry.title}" approved`
                    );
                }
                return;
            default:
                return;
        }
    }

    private async grantRole(discordId: string, role: BoundRole, reason: string): Promise<void> {
        const roleId = this.settings.role(role);
        if (roleId === undefined) {
            return;
        }
        const guild = await this.client.guilds.fetch(this.guildId);
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (member !== null && !member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, reason.slice(0, 400));
        }
    }

    private async channel(purpose: ChannelPurpose): Promise<SendableChannels | null> {
        const id = this.settings.channel(purpose);
        if (id === undefined) {
            return null;
        }
        const channel = await this.client.channels.fetch(id).catch(() => null);
        if (channel === null || !channel.isSendable() || channel.isDMBased() || channel.guildId !== this.guildId) {
            return null;
        }
        return channel;
    }
}
