import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export interface Infraction {
    readonly id: string;
    readonly timestamp: string; // ISO string
    readonly reason: string;
    readonly channelId: string;
    readonly messageSnippet: string;
}

export interface TimeoutRecord {
    readonly id: string;
    readonly timestamp: string; // ISO string
    readonly durationMs: number;
    readonly reason: string;
    readonly level: number;
}

export type ApologyStatus = "none" | "pending" | "approved" | "rejected";

export interface ApologyRecord {
    readonly status: ApologyStatus;
    readonly text: string | null;
    readonly submittedAt: string | null;
    readonly reviewedBy?: string | null;
    readonly reviewedAt?: string | null;
}

export interface UserWarningRecord {
    readonly userId: string;
    offenceLevel: number; // 0 = clean, 1 = 1st offence (24h timeout), 2 = 2nd offence (1w timeout), 3 = 3rd offence (banned)
    stageWarnings: number; // warnings in current stage (0/5, 0/3, 0/1)
    infractions: Infraction[];
    timeouts: TimeoutRecord[];
    apology: ApologyRecord;
}

const infractionSchema = z.object({
    id: z.string(),
    timestamp: z.string(),
    reason: z.string(),
    channelId: z.string(),
    messageSnippet: z.string()
});

const timeoutSchema = z.object({
    id: z.string(),
    timestamp: z.string(),
    durationMs: z.number(),
    reason: z.string(),
    level: z.number().default(1)
});

const apologySchema = z
    .object({
        status: z.enum(["none", "pending", "approved", "rejected"]).default("none"),
        text: z.string().nullable().default(null),
        submittedAt: z.string().nullable().default(null),
        reviewedBy: z.string().nullable().optional(),
        reviewedAt: z.string().nullable().optional()
    })
    .default({ status: "none", text: null, submittedAt: null });

const userWarningSchema = z.object({
    userId: z.string(),
    offenceLevel: z.number().default(0),
    stageWarnings: z.number().default(0),
    infractions: z.array(infractionSchema).default([]),
    timeouts: z.array(timeoutSchema).default([]),
    apology: apologySchema
});

const storeSchema = z.array(userWarningSchema).default([]);

export const warningDecayDays = 30;
export const warningDecayMs = warningDecayDays * 24 * 60 * 60 * 1000;

export type InfractionPenalty =
    | { readonly type: "warning"; readonly current: number; readonly max: number; readonly offenceLevel: number }
    | { readonly type: "first_offence_24h"; readonly durationMs: number; readonly current: number; readonly max: number }
    | { readonly type: "second_offence_1w"; readonly durationMs: number; readonly current: number; readonly max: number }
    | { readonly type: "third_offence_ban"; readonly durationMs: number; readonly current: number; readonly max: number };

export class WarningStore {
    private records: Map<string, UserWarningRecord> = new Map();
    private writeChain: Promise<void> = Promise.resolve();
    private readonly path: string;

    public constructor(private readonly directory: string) {
        this.path = join(directory, "warnings.json");
    }

    public async load(): Promise<void> {
        try {
            const parsed = storeSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
            if (parsed.success) {
                this.records.clear();
                for (const record of parsed.data) {
                    this.records.set(record.userId, record);
                }
            }
        } catch {
            this.records.clear();
        }
    }

    public addWarning(userId: string, reason: string, channelId: string, messageSnippet: string): InfractionPenalty {
        const record = this.getOrCreate(userId);
        this.pruneDecayedInfractions(record);

        const infraction: Infraction = {
            id: randomBytes(4).toString("hex"),
            timestamp: new Date().toISOString(),
            reason,
            channelId,
            messageSnippet
        };
        record.infractions.push(infraction);
        record.stageWarnings += 1;

        let penalty: InfractionPenalty;

        if (record.offenceLevel === 0) {
            const max = 5;
            if (record.stageWarnings >= max) {
                record.offenceLevel = 1;
                record.stageWarnings = 0;
                const durationMs = 24 * 60 * 60 * 1000;
                this.recordTimeoutInternal(record, durationMs, "1st offence: 5 profanity warnings reached", 1);
                penalty = { type: "first_offence_24h", durationMs, current: 5, max };
            } else {
                penalty = { type: "warning", current: record.stageWarnings, max, offenceLevel: 0 };
            }
        } else if (record.offenceLevel === 1) {
            const max = 3;
            if (record.stageWarnings >= max) {
                record.offenceLevel = 2;
                record.stageWarnings = 0;
                const durationMs = 7 * 24 * 60 * 60 * 1000;
                this.recordTimeoutInternal(record, durationMs, "2nd offence: 3 additional profanity warnings reached", 2);
                penalty = { type: "second_offence_1w", durationMs, current: 3, max };
            } else {
                penalty = { type: "warning", current: record.stageWarnings, max, offenceLevel: 1 };
            }
        } else {
            const max = 1;
            record.offenceLevel = 3;
            record.stageWarnings = 0;
            const durationMs = 30 * 24 * 60 * 60 * 1000;
            this.recordTimeoutInternal(record, durationMs, "3rd offence: 1 additional profanity warning reached (ban)", 3);
            penalty = { type: "third_offence_ban", durationMs, current: 1, max };
        }

        void this.persist();
        return penalty;
    }

    public submitApology(userId: string, text: string): void {
        const record = this.getOrCreate(userId);
        if (record.offenceLevel < 3) {
            throw new Error("Only banned users can submit a ban apology review.");
        }
        if (record.apology.status === "pending") {
            throw new Error("An apology review request is already pending supervisor evaluation.");
        }
        record.apology = {
            status: "pending",
            text: text.trim(),
            submittedAt: new Date().toISOString()
        };
        void this.persist();
    }

    public reviewApology(userId: string, approved: boolean, reviewerId: string): UserWarningRecord {
        const record = this.getOrCreate(userId);
        if (record.apology.status !== "pending") {
            throw new Error("No pending apology review found for this user.");
        }

        if (approved) {
            // automatically reset all offences and warnings upon approval
            record.offenceLevel = 0;
            record.stageWarnings = 0;
            record.infractions = [];
            record.apology = {
                status: "approved",
                text: record.apology.text,
                submittedAt: record.apology.submittedAt,
                reviewedBy: reviewerId,
                reviewedAt: new Date().toISOString()
            };
        } else {
            record.apology = {
                status: "rejected",
                text: record.apology.text,
                submittedAt: record.apology.submittedAt,
                reviewedBy: reviewerId,
                reviewedAt: new Date().toISOString()
            };
        }

        void this.persist();
        return record;
    }

    public resetUser(userId: string): void {
        const record = this.getOrCreate(userId);
        record.offenceLevel = 0;
        record.stageWarnings = 0;
        record.infractions = [];
        record.timeouts = [];
        record.apology = { status: "none", text: null, submittedAt: null };
        void this.persist();
    }

    public getRecord(userId: string): UserWarningRecord | undefined {
        const record = this.records.get(userId);
        if (record !== undefined) {
            this.pruneDecayedInfractions(record);
        }
        return record;
    }

    public flush(): Promise<void> {
        return this.writeChain;
    }

    private pruneDecayedInfractions(record: UserWarningRecord): void {
        const cutoff = Date.now() - warningDecayMs;
        const fresh = record.infractions.filter((inf) => new Date(inf.timestamp).getTime() > cutoff);
        if (fresh.length !== record.infractions.length) {
            record.infractions = fresh;
            if (fresh.length === 0 && record.offenceLevel === 0) {
                record.stageWarnings = 0;
            }
        }
    }

    private recordTimeoutInternal(record: UserWarningRecord, durationMs: number, reason: string, level: number): void {
        const timeout: TimeoutRecord = {
            id: randomBytes(4).toString("hex"),
            timestamp: new Date().toISOString(),
            durationMs,
            reason,
            level
        };
        record.timeouts.push(timeout);
    }

    private getOrCreate(userId: string): UserWarningRecord {
        let record = this.records.get(userId);
        if (record === undefined) {
            record = {
                userId,
                offenceLevel: 0,
                stageWarnings: 0,
                infractions: [],
                timeouts: [],
                apology: { status: "none", text: null, submittedAt: null }
            };
            this.records.set(userId, record);
        }
        return record;
    }

    private persist(): Promise<void> {
        const list = Array.from(this.records.values());
        const content = JSON.stringify(list, null, 2);
        this.writeChain = this.writeChain.then(async () => {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            const temporary = `${this.path}.${process.pid}.tmp`;
            await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
            await rename(temporary, this.path);
        });
        return this.writeChain;
    }
}
