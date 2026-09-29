import type { FastifyBaseLogger } from "fastify";
import type { KeyValueStore } from "../Infrastructure/Cache/KeyValueStore.js";
import type { TokenService } from "../Modules/Auth/TokenService.js";
import type { ShotsService } from "../Modules/Shots/ShotsService.js";
import type { LeaderboardService } from "../Modules/Leaderboards/LeaderboardService.js";

interface ScheduledJob {
    readonly name: string;
    readonly intervalMs: number;
    readonly run: () => Promise<void>;
}

export class MaintenanceScheduler {
    private readonly timers: NodeJS.Timeout[] = [];
    private readonly jobs: readonly ScheduledJob[];

    public constructor(
        shotsService: ShotsService,
        tokenService: TokenService,
        leaderboardService: LeaderboardService,
        private readonly store: KeyValueStore,
        private readonly logger: FastifyBaseLogger
    ) {
        this.jobs = [
            {
                name: "reclaim-expired-shots",
                intervalMs: 15 * 60 * 1000,
                run: async (): Promise<void> => {
                    const result = await shotsService.reclaimExpired();
                    if (result.reclaimedCount > 0) {
                        this.logger.info({ reclaimed: result.shotCodes }, "reclaimed expired shot claims");
                    }
                }
            },
            {
                name: "purge-expired-tokens",
                intervalMs: 60 * 60 * 1000,
                run: async (): Promise<void> => {
                    await tokenService.purgeExpired();
                }
            },
            {
                name: "finalize-expired-rounds",
                intervalMs: 60 * 1000,
                run: async (): Promise<void> => {
                    const result = await leaderboardService.finalizeExpired();
                    if (result.finalizedCount > 0) {
                        this.logger.info({ finalized: result.roundIds }, "auto-finalized expired voting rounds");
                    }
                }
            }
        ];
    }

    public start(): void {
        for (const job of this.jobs) {
            const initial = setTimeout(() => void this.execute(job), 10_000);
            const recurring = setInterval(() => void this.execute(job), job.intervalMs);
            initial.unref();
            recurring.unref();
            this.timers.push(initial, recurring);
        }
    }

    public stop(): void {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers.length = 0;
    }

    private async execute(job: ScheduledJob): Promise<void> {
        try {
            const lockSeconds = Math.max(1, Math.floor(job.intervalMs / 1000) - 5);
            if (!(await this.store.setIfAbsent(`job-lock:${job.name}`, String(process.pid), lockSeconds))) {
                return;
            }
            await job.run();
        } catch (error: unknown) {
            this.logger.error({ err: error, job: job.name }, "maintenance job failed");
        }
    }
}
