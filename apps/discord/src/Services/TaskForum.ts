import { ShotStatus, type ShotDto, type ShotReference } from "@platform/contracts";
import { ChannelType, type Client, type ForumChannel, type ThreadChannel } from "discord.js";
import type { Logger } from "pino";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";
import type { V2Message } from "../Discord/Ui.js";
import { ChannelPurpose, type SettingsStore } from "../State/SettingsStore.js";
import { threadStarter } from "../Views/TaskViews.js";

export interface SyncSummary {
    readonly created: number;
    readonly updated: number;
    readonly removed: number;
    readonly failed: number;
}

export function referenceOf(shot: Pick<ShotDto, "id" | "shotCode" | "title" | "sceneNumber" | "difficultyTier">): ShotReference {
    return {
        id: shot.id,
        code: shot.shotCode,
        title: shot.title,
        sceneNumber: shot.sceneNumber,
        difficulty: shot.difficultyTier
    };
}

export class TaskForum {
    private readonly threadsByShot = new Map<string, string>();
    private readonly shotsByThread = new Map<string, string>();
    private readonly pendingThreads = new Map<string, Promise<string | null>>();

    public constructor(
        private readonly client: Client,
        private readonly guildId: string,
        private readonly settings: SettingsStore,
        private readonly api: PlatformApiClient,
        private readonly logger: Logger
    ) {}

    public async load(): Promise<void> {
        for (const map of await this.api.listThreadMaps()) {
            this.remember(map.shotId, map.discordThreadId);
        }
    }

    public threadFor(shotId: string): string | undefined {
        return this.threadsByShot.get(shotId);
    }

    public shotFor(threadId: string): string | undefined {
        return this.shotsByThread.get(threadId);
    }

    public async forum(): Promise<ForumChannel | null> {
        const id = this.settings.channel(ChannelPurpose.TaskForum);
        if (id === undefined) {
            return null;
        }
        const channel = await this.client.channels.fetch(id).catch(() => null);
        return channel !== null && channel.type === ChannelType.GuildForum && channel.guildId === this.guildId ? channel : null;
    }

    public ensureThread(shot: ShotReference, description: string | null, status: ShotStatus): Promise<string | null> {
        const inFlight = this.pendingThreads.get(shot.id);
        if (inFlight !== undefined) {
            return inFlight;
        }
        const creation = this.createThread(shot, description, status).finally(() => this.pendingThreads.delete(shot.id));
        this.pendingThreads.set(shot.id, creation);
        return creation;
    }

    public async ensureThreadFor(shotId: string): Promise<string | null> {
        const shot = await this.api.getShot(shotId);
        return this.ensureThread(referenceOf(shot), shot.description, shot.status);
    }

    private async createThread(shot: ShotReference, description: string | null, status: ShotStatus): Promise<string | null> {
        const existing = await this.thread(shot.id);
        if (existing !== null) {
            return existing.id;
        }
        const forum = await this.forum();
        if (forum === null) {
            return null;
        }
        const tag = this.settings.forumTag(status);
        const thread = await forum.threads.create({
            name: this.threadName(shot),
            message: threadStarter(shot, description),
            appliedTags: tag === undefined ? [] : [tag],
            reason: `Task ${shot.code}`
        });
        this.remember(shot.id, thread.id);
        await this.api.bindThread(shot.id, thread.id);
        return thread.id;
    }

    public async rename(shot: ShotReference): Promise<void> {
        const thread = await this.thread(shot.id);
        if (thread !== null && thread.name !== this.threadName(shot)) {
            await thread.setName(this.threadName(shot));
        }
    }

    public async setStatus(shotId: string, status: ShotStatus): Promise<void> {
        const thread = await this.thread(shotId);
        const tag = this.settings.forumTag(status);
        if (thread === null || tag === undefined) {
            return;
        }
        if (thread.appliedTags.length !== 1 || thread.appliedTags[0] !== tag) {
            await thread.setAppliedTags([tag]);
        }
        if (status === ShotStatus.Approved) {
            await thread.setLocked(true, "Task approved");
        } else if (thread.locked === true) {
            await thread.setLocked(false, "Task reopened");
        }
    }

    public async post(shotId: string, content: V2Message): Promise<void> {
        const thread = await this.thread(shotId);
        if (thread === null) {
            return;
        }
        if (thread.archived === true) {
            await thread.setArchived(false);
        }
        await thread.send(content);
    }

    public async remove(shotId: string): Promise<void> {
        const thread = await this.thread(shotId);
        if (thread !== null) {
            await thread.delete("Task deleted");
        }
        const threadId = this.threadsByShot.get(shotId);
        this.threadsByShot.delete(shotId);
        if (threadId !== undefined) {
            this.shotsByThread.delete(threadId);
        }
        await this.api.unbindThread(shotId).catch((error: unknown) => {
            this.logger.warn({ err: error, shotId }, "failed to unbind thread");
        });
    }

    public async sync(shots: readonly ShotDto[]): Promise<SyncSummary> {
        const forum = await this.forum();
        if (forum === null) {
            throw new Error("The task forum isn't configured. Run /setup-forum first.");
        }
        let created = 0;
        let updated = 0;
        let failed = 0;
        const known = new Set<string>();
        for (const shot of shots) {
            try {
                const reference = referenceOf(shot);
                const existing = await this.thread(shot.id);
                if (existing === null) {
                    const threadId = await this.ensureThread(reference, shot.description, shot.status);
                    if (threadId !== null) {
                        known.add(threadId);
                        created++;
                    }
                    continue;
                }
                known.add(existing.id);
                const tag = this.settings.forumTag(shot.status);
                const stale =
                    existing.name !== this.threadName(reference) ||
                    (tag !== undefined && (existing.appliedTags.length !== 1 || existing.appliedTags[0] !== tag));
                if (stale) {
                    await this.rename(reference);
                    await this.setStatus(shot.id, shot.status);
                    updated++;
                }
            } catch (error: unknown) {
                failed++;
                this.logger.warn({ err: error, shotId: shot.id }, "failed to sync task thread");
            }
        }

        let removed = 0;
        const active = await forum.threads.fetchActive();
        for (const [threadId, thread] of active.threads) {
            if (thread.parentId === forum.id && !known.has(threadId) && thread.ownerId === this.client.user?.id) {
                await thread.delete("Task no longer exists").then(
                    () => removed++,
                    () => failed++
                );
            }
        }
        return { created, updated, removed, failed };
    }

    private async thread(shotId: string): Promise<ThreadChannel | null> {
        const threadId = this.threadsByShot.get(shotId);
        if (threadId === undefined) {
            return null;
        }
        const channel = await this.client.channels.fetch(threadId).catch(() => null);
        if (channel === null || !channel.isThread() || channel.guildId !== this.guildId) {
            this.threadsByShot.delete(shotId);
            this.shotsByThread.delete(threadId);
            return null;
        }
        return channel;
    }

    private remember(shotId: string, threadId: string): void {
        const previousThread = this.threadsByShot.get(shotId);
        if (previousThread !== undefined) {
            this.shotsByThread.delete(previousThread);
        }
        this.threadsByShot.set(shotId, threadId);
        this.shotsByThread.set(threadId, shotId);
    }

    private threadName(shot: ShotReference): string {
        return `${shot.code} - ${shot.title}`.slice(0, 100);
    }
}
