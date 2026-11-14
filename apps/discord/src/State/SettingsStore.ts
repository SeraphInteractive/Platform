import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ShotStatus, enumValues, notificationStreamIdPattern, type UpdateDiscordSettingsDto } from "@platform/contracts";
import { z } from "zod";
import type { PlatformApiClient } from "../Api/PlatformApiClient.js";

export enum ChannelPurpose {
    Welcome = "welcome",
    Rules = "rules",
    Announcements = "announcements",
    ProductionAnnouncements = "productionAnnouncements",
    Telemetry = "telemetry",
    SecurityAlerts = "securityAlerts",
    TaskLogs = "taskLogs",
    VotingLogs = "votingLogs",
    UserLogs = "userLogs",
    SystemLogs = "systemLogs",
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
    rulesMessageId: snowflake.optional(),
    webhooks: z.record(z.string(), z.string()).default({})
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
                        rulesMessageId: remote.rulesMessageId ?? undefined,
                        webhooks: remote.webhooks ?? {}
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
        const direct = this.settings.channels[purpose];
        if (direct !== undefined) {
            return direct;
        }
        if (
            purpose === ChannelPurpose.SecurityAlerts ||
            purpose === ChannelPurpose.TaskLogs ||
            purpose === ChannelPurpose.VotingLogs ||
            purpose === ChannelPurpose.UserLogs ||
            purpose === ChannelPurpose.SystemLogs
        ) {
            return this.settings.channels[ChannelPurpose.Telemetry];
        }
        if (purpose === ChannelPurpose.Telemetry) {
            return this.settings.channels[ChannelPurpose.SecurityAlerts];
        }
        return undefined;
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

    public webhook(purpose: string): string | undefined {
        const direct = this.settings.webhooks[purpose];
        if (direct !== undefined) {
            return direct;
        }
        // alias fallback mapping
        switch (purpose) {
            case "securityAlerts":
            case "security-alerts":
                return (
                    this.settings.webhooks.securityAlerts ??
                    this.settings.webhooks["security-alerts"] ??
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"]
                );
            case "telemetry":
            case "telemetry-alerts":
                return (
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"] ??
                    this.settings.webhooks.securityAlerts ??
                    this.settings.webhooks["security-alerts"]
                );
            case "productionAnnouncements":
            case "production-announcements":
                return this.settings.webhooks.productionAnnouncements ?? this.settings.webhooks["production-announcements"];
            case "moderationLogs":
            case "moderation-logs":
                return this.settings.webhooks.moderationLogs ?? this.settings.webhooks["moderation-logs"];
            case "taskLogs":
            case "task-logs":
                return (
                    this.settings.webhooks.taskLogs ??
                    this.settings.webhooks["task-logs"] ??
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"]
                );
            case "votingLogs":
            case "voting-logs":
                return (
                    this.settings.webhooks.votingLogs ??
                    this.settings.webhooks["voting-logs"] ??
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"]
                );
            case "userLogs":
            case "user-logs":
                return (
                    this.settings.webhooks.userLogs ??
                    this.settings.webhooks["user-logs"] ??
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"]
                );
            case "systemLogs":
            case "system-logs":
                return (
                    this.settings.webhooks.systemLogs ??
                    this.settings.webhooks["system-logs"] ??
                    this.settings.webhooks.telemetry ??
                    this.settings.webhooks["telemetry-alerts"]
                );
            default:
                return undefined;
        }
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
                JSON.stringify(previousSnapshot.webhooks) === JSON.stringify(this.settings.webhooks) &&
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
            rulesMessageId: this.settings.rulesMessageId ?? null,
            webhooks: this.settings.webhooks
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
