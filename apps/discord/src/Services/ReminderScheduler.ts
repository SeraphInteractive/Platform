import type { Client } from "discord.js";
import type { Logger } from "pino";
import type { ReminderStore } from "../State/ReminderStore.js";

export class ReminderScheduler {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;

    public constructor(
        private readonly client: Client,
        private readonly store: ReminderStore,
        private readonly logger: Logger
    ) {}

    public start(): void {
        this.running = true;
        this.schedule();
    }

    public stop(): void {
        this.running = false;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    public reschedule(): void {
        if (this.running) {
            this.schedule();
        }
    }

    private schedule(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        const next = this.store.nextFireAt();
        if (next === null) {
            return;
        }

        // clamp to at least 1s to avoid tight loops on past-due reminders
        const delay = Math.max(next.getTime() - Date.now(), 1_000);
        this.timer = setTimeout(() => {
            void this.fire();
        }, delay);
    }

    private async fire(): Promise<void> {
        this.timer = null;
        const fired = this.store.drain();

        for (const reminder of fired) {
            try {
                const user = await this.client.users.fetch(reminder.userId);
                await user.send(`⏰ **Reminder:** ${reminder.message}`);
            } catch (error: unknown) {
                this.logger.warn({ err: error, userId: reminder.userId, reminderId: reminder.id }, "failed to DM reminder");
            }
        }

        if (this.running) {
            this.schedule();
        }
    }
}
