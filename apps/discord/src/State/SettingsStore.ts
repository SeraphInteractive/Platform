import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ShotStatus, enumValues, notificationStreamIdPattern, type UpdateDiscordSettingsDto } from "@platform/contracts";
import { z } from "zod";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";

export enum ChannelPurpose {
    Welcome = "welcome",
    Rules = "rules",
    Announcements = "announcements",
    Telemetry = "telemetry",
    TaskLogs = "taskLogs",
    TaskSubmissions = "taskSubmissions",
    TaskForum = "taskForum",
    ModerationLogs = "moderationLogs"
}

export enum BoundRole {
    Member = "member",
    Voter = "voter",
    Contributor = "contributor"
}

const snowflake = z.string().regex(/^\d{17,20}$/u);

const settingsSchema = z.object({
    channels: z.partialRecord(z.enum(ChannelPurpose), snowflake).default({}),
    roles: z.partialRecord(z.enum(BoundRole), snowflake).default({}),
    forumTags: z.partialRecord(z.enum(enumValues(ShotStatus)), snowflake).default({}),
    notificationCursor: z.string().regex(notificationStreamIdPattern).nullable().default(null),
    rulesMessageId: snowflake.optional()
});

export type Settings = z.infer<typeof settingsSchema>;

export class SettingsStore {
    private settings: Settings = settingsSchema.parse({});
    private writeChain: Promise<void> = Promise.resolve();
    private pendingRemoteSync: Promise<void> = Promise.resolve();
    private cursorSyncTimer: NodeJS.Timeout | null = null;
    private readonly path: string;

    public constructor(
        private readonly directory: string,
        private readonly api?: PlatformApiClient,
        private readonly guildId?: string
    ) {
        this.path = join(directory, "settings.json");
    }

    public async load(): Promise<void> {
        if (this.api !== undefined && this.guildId !== undefined) {
            try {
                const remote = await this.api.getDiscordSettings(this.guildId);
                if (remote !== null) {
                    this.settings = {
                        channels: remote.channels ?? {},
                        roles: remote.roles ?? {},
                        forumTags: remote.forumTags ?? {},
                        notificationCursor: remote.notificationCursor ?? null,
                        rulesMessageId: remote.rulesMessageId ?? undefined
                    };
                    void this.persistLocal();
                    return;
                }
            } catch {
                // fall through to local cache if api is unreachable
            }
        }

        try {
            const parsed = settingsSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
            this.settings = parsed.success ? parsed.data : settingsSchema.parse({});
        } catch {
            this.settings = settingsSchema.parse({});
        }
    }

    public channel(purpose: ChannelPurpose): string | undefined {
        return this.settings.channels[purpose];
    }

    public role(role: BoundRole): string | undefined {
        return this.settings.roles[role];
    }

    public forumTag(status: ShotStatus): string | undefined {
        return this.settings.forumTags[status];
    }

    public get notificationCursor(): string | null {
        return this.settings.notificationCursor;
    }

    public get rulesMessageId(): string | undefined {
        return this.settings.rulesMessageId;
    }

    public snapshot(): Settings {
        return structuredClone(this.settings);
    }

    public async update(mutate: (settings: Settings) => void): Promise<void> {
        const previousSnapshot = structuredClone(this.settings);
        mutate(this.settings);
        await this.persistLocal();

        if (this.api !== undefined && this.guildId !== undefined) {
            const onlyCursorChanged =
                previousSnapshot.notificationCursor !== this.settings.notificationCursor &&
                JSON.stringify(previousSnapshot.channels) === JSON.stringify(this.settings.channels) &&
                JSON.stringify(previousSnapshot.roles) === JSON.stringify(this.settings.roles) &&
                JSON.stringify(previousSnapshot.forumTags) === JSON.stringify(this.settings.forumTags) &&
                previousSnapshot.rulesMessageId === this.settings.rulesMessageId;

            if (onlyCursorChanged) {
                this.debounceCursorSync();
            } else {
                if (this.cursorSyncTimer !== null) {
                    clearTimeout(this.cursorSyncTimer);
                    this.cursorSyncTimer = null;
                }
                this.syncRemote();
            }
        }
    }

    public async flush(): Promise<void> {
        if (this.cursorSyncTimer !== null) {
            clearTimeout(this.cursorSyncTimer);
            this.cursorSyncTimer = null;
            this.syncRemote();
        }
        await Promise.all([this.writeChain, this.pendingRemoteSync]);
    }

    private debounceCursorSync(): void {
        if (this.cursorSyncTimer !== null) {
            clearTimeout(this.cursorSyncTimer);
        }
        this.cursorSyncTimer = setTimeout(() => {
            this.cursorSyncTimer = null;
            this.syncRemote();
        }, 1000);
    }

    private syncRemote(): void {
        if (this.api === undefined || this.guildId === undefined) {
            return;
        }
        const payload: UpdateDiscordSettingsDto = {
            channels: this.settings.channels,
            roles: this.settings.roles,
            forumTags: this.settings.forumTags,
            notificationCursor: this.settings.notificationCursor,
            rulesMessageId: this.settings.rulesMessageId ?? null
        };
        this.pendingRemoteSync = this.pendingRemoteSync
            .then(async () => {
                await this.api!.updateDiscordSettings(this.guildId!, payload);
            })
            .catch(() => undefined);
    }

    private persistLocal(): Promise<void> {
        const content = JSON.stringify(this.settings, null, 2);
        this.writeChain = this.writeChain.then(async () => {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            const temporary = `${this.path}.${process.pid}.tmp`;
            await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
            await rename(temporary, this.path);
        });
        return this.writeChain;
    }
}
