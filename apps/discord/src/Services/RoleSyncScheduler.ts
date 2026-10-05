import type { Client } from "discord.js";
import type { Logger } from "pino";
import type { RoleReconciliationService } from "./RoleReconciliationService.js";

export function getNextScheduledSyncDate(from: Date = new Date()): Date {
    const target = new Date(from.getTime());
    const currentDay = target.getUTCDay();
    const currentHour = target.getUTCHours();
    const currentMin = target.getUTCMinutes();
    const currentSec = target.getUTCSeconds();
    const currentMs = target.getUTCMilliseconds();

    // target day: sunday (0) at 03:00:00.000 utc
    let daysToAdd = (7 - currentDay) % 7;
    if (daysToAdd === 0) {
        const isPastTargetToday = currentHour > 3 || (currentHour === 3 && (currentMin > 0 || currentSec > 0 || currentMs > 0));
        if (isPastTargetToday) {
            daysToAdd = 7;
        }
    }

    target.setUTCDate(target.getUTCDate() + daysToAdd);
    target.setUTCHours(3, 0, 0, 0);
    return target;
}

export class RoleSyncScheduler {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private running = false;

    public constructor(
        private readonly reconciler: RoleReconciliationService,
        private readonly guildId: string,
        private readonly client: Client,
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

    private schedule(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (!this.running) {
            return;
        }

        const next = getNextScheduledSyncDate();
        const delay = Math.max(next.getTime() - Date.now(), 1_000);
        this.logger.info(
            { nextSync: next.toISOString(), delayMinutes: Math.round(delay / 60_000) },
            "scheduled next weekly role reconciliation"
        );

        this.timer = setTimeout(() => {
            void this.execute();
        }, delay);
    }

    private async execute(): Promise<void> {
        this.timer = null;
        try {
            const guild = await this.client.guilds.fetch(this.guildId).catch(() => null);
            if (guild !== null) {
                await this.reconciler.reconcile(guild, "scheduled");
            } else {
                this.logger.warn({ guildId: this.guildId }, "could not fetch guild for scheduled role reconciliation");
            }
        } catch (error: unknown) {
            this.logger.error({ err: error }, "error during scheduled role reconciliation");
        } finally {
            if (this.running) {
                this.schedule();
            }
        }
    }
}
