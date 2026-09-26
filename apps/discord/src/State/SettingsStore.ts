import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ShotStatus, enumValues, notificationStreamIdPattern } from "@platform/contracts";
import { z } from "zod";

export enum ChannelPurpose {
    Announcements = "announcements",
    Telemetry = "telemetry",
    TaskLogs = "taskLogs",
    TaskSubmissions = "taskSubmissions",
    TaskForum = "taskForum"
}

export enum BoundRole {
    Observer = "observer",
    Contributor = "contributor"
}

const snowflake = z.string().regex(/^\d{17,20}$/u);

const settingsSchema = z.object({
    channels: z.partialRecord(z.enum(ChannelPurpose), snowflake).default({}),
    roles: z.partialRecord(z.enum(BoundRole), snowflake).default({}),
    forumTags: z.partialRecord(z.enum(enumValues(ShotStatus)), snowflake).default({}),
    notificationCursor: z.string().regex(notificationStreamIdPattern).nullable().default(null)
});

export type Settings = z.infer<typeof settingsSchema>;

export class SettingsStore {
    private settings: Settings = settingsSchema.parse({});
    private writeChain: Promise<void> = Promise.resolve();
    private readonly path: string;

    public constructor(private readonly directory: string) {
        this.path = join(directory, "settings.json");
    }

    public async load(): Promise<void> {
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

    public snapshot(): Settings {
        return structuredClone(this.settings);
    }

    public async update(mutate: (settings: Settings) => void): Promise<void> {
        mutate(this.settings);
        await this.persist();
    }

    private persist(): Promise<void> {
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
