import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export interface Reminder {
    readonly id: string;
    readonly userId: string;
    readonly message: string;
    readonly fireAt: string; // ISO
    readonly createdAt: string; // ISO
}

const reminderSchema = z.object({
    id: z.string(),
    userId: z.string(),
    message: z.string(),
    fireAt: z.string(),
    createdAt: z.string()
});

const storeSchema = z.array(reminderSchema).default([]);

const maxPerUser = 10;

export class ReminderStore {
    private reminders: Reminder[] = [];
    private writeChain: Promise<void> = Promise.resolve();
    private readonly path: string;

    public constructor(private readonly directory: string) {
        this.path = join(directory, "reminders.json");
    }

    public async load(): Promise<void> {
        try {
            const parsed = storeSchema.safeParse(JSON.parse(await readFile(this.path, "utf8")));
            this.reminders = parsed.success ? parsed.data : [];
        } catch {
            this.reminders = [];
        }
    }

    public add(userId: string, message: string, fireAt: Date): Reminder {
        const existing = this.reminders.filter((r) => r.userId === userId);
        if (existing.length >= maxPerUser) {
            throw new Error(`You already have ${maxPerUser} active reminders. Cancel one first.`);
        }
        const reminder: Reminder = {
            id: randomBytes(4).toString("hex"),
            userId,
            message,
            fireAt: fireAt.toISOString(),
            createdAt: new Date().toISOString()
        };
        this.reminders.push(reminder);
        void this.persist();
        return reminder;
    }

    public remove(id: string, userId: string): boolean {
        const index = this.reminders.findIndex((r) => r.id === id && r.userId === userId);
        if (index === -1) {
            return false;
        }
        this.reminders.splice(index, 1);
        void this.persist();
        return true;
    }

    public forUser(userId: string): readonly Reminder[] {
        return this.reminders
            .filter((r) => r.userId === userId)
            .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());
    }

    public drain(): Reminder[] {
        const now = Date.now();
        const fired: Reminder[] = [];
        const remaining: Reminder[] = [];
        for (const r of this.reminders) {
            if (new Date(r.fireAt).getTime() <= now) {
                fired.push(r);
            } else {
                remaining.push(r);
            }
        }
        if (fired.length > 0) {
            this.reminders = remaining;
            void this.persist();
        }
        return fired;
    }

    public nextFireAt(): Date | null {
        if (this.reminders.length === 0) {
            return null;
        }
        let earliest = Infinity;
        for (const r of this.reminders) {
            const t = new Date(r.fireAt).getTime();
            if (t < earliest) {
                earliest = t;
            }
        }
        return new Date(earliest);
    }

    public get size(): number {
        return this.reminders.length;
    }

    public flush(): Promise<void> {
        return this.writeChain;
    }

    private persist(): Promise<void> {
        const content = JSON.stringify(this.reminders, null, 2);
        this.writeChain = this.writeChain.then(async () => {
            await mkdir(this.directory, { recursive: true, mode: 0o700 });
            const temporary = `${this.path}.${process.pid}.tmp`;
            await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
            await rename(temporary, this.path);
        });
        return this.writeChain;
    }
}
