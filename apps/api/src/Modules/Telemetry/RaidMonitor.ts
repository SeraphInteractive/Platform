import { analyzeRaidRisk, calculateVelocityZScore, getScoringScheme, RaidSeverity, type EntryScoreBreakdown } from "@platform/scoring";
import { and, eq, or, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import type { Database } from "../../Infrastructure/Database/Database.js";
import { ballots, entries, raidTelemetry, users, votingRounds, type RaidTelemetryRecord } from "../../Infrastructure/Database/Schema.js";
import { RoundEventType, type EventBus } from "../../Infrastructure/Events/EventBus.js";
import { NotificationType, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import type { LeaderboardCache } from "../Leaderboards/LeaderboardCache.js";

export interface RaidMonitorOptions {
    readonly debounceMs: number;
    readonly alertCooldownSeconds: number;
}

const defaultOptions: RaidMonitorOptions = { debounceMs: 15_000, alertCooldownSeconds: 600 };

export class RaidMonitor {
    private readonly timers = new Set<NodeJS.Timeout>();

    public constructor(
        private readonly database: Database,
        private readonly store: KeyValueStore,
        private readonly eventBus: EventBus,
        private readonly notifier: Notifier,
        private readonly leaderboardCache: LeaderboardCache,
        private readonly logger: FastifyBaseLogger,
        private readonly options: RaidMonitorOptions = defaultOptions
    ) {}

    public schedule(roundId: string, entryIds: readonly string[]): void {
        for (const entryId of new Set(entryIds)) {
            void this.scheduleEntry(roundId, entryId);
        }
    }

    public async analyze(roundId: string, entryId: string): Promise<RaidTelemetryRecord | null> {
        const [context] = await this.database
            .select({
                pollType: votingRounds.pollType,
                roundTitle: votingRounds.title,
                entryTitle: entries.title,
                isQuarantined: entries.isQuarantined
            })
            .from(entries)
            .innerJoin(votingRounds, eq(votingRounds.id, entries.roundId))
            .where(and(eq(entries.id, entryId), eq(entries.roundId, roundId)))
            .limit(1);
        if (context === undefined) {
            return null;
        }

        const [counts] = await this.database
            .select({
                rank1: sql<number>`count(*) filter (where ${ballots.rank1EntryId} = ${entryId})`.mapWith(Number),
                rank2: sql<number>`count(*) filter (where ${ballots.rank2EntryId} = ${entryId})`.mapWith(Number),
                rank3: sql<number>`count(*) filter (where ${ballots.rank3EntryId} = ${entryId})`.mapWith(Number),
                recent: sql<number>`count(*) filter (where ${ballots.updatedAt} >= now() - interval '5 minutes')`.mapWith(Number),
                trailingHour: sql<number>`count(*) filter (where ${ballots.updatedAt} >= now() - interval '60 minutes')`.mapWith(Number)
            })
            .from(ballots)
            .innerJoin(users, eq(users.id, ballots.voterId))
            .where(
                and(
                    eq(ballots.roundId, roundId),
                    eq(users.isBlacklisted, false),
                    or(eq(ballots.rank1EntryId, entryId), eq(ballots.rank2EntryId, entryId), eq(ballots.rank3EntryId, entryId))
                )
            );

        const scheme = getScoringScheme(context.pollType);
        const rankCounts = [counts?.rank1 ?? 0, counts?.rank2 ?? 0, counts?.rank3 ?? 0].slice(0, scheme.weights.length);
        const breakdown: EntryScoreBreakdown = {
            entryId,
            rankCounts,
            appearanceCount: rankCounts.reduce((sum, value) => sum + value, 0),
            rawScore: rankCounts.reduce((sum, value, position) => sum + value * (scheme.weights[position] ?? 0), 0),
            voteSharePercentage: 0
        };
        const telemetry = analyzeRaidRisk(breakdown, calculateVelocityZScore(counts?.recent ?? 0, counts?.trailingHour ?? 0), scheme);

        const [record] = await this.database
            .insert(raidTelemetry)
            .values({
                entryId,
                roundId,
                compositeScore: telemetry.compositeScore,
                severity: telemetry.severity,
                skewRatio: telemetry.skewRatio,
                rankEntropy: telemetry.rankEntropy,
                velocityZScore: telemetry.velocityZScore,
                flags: [...telemetry.flags],
                breakdown: { ...telemetry.breakdown }
            })
            .returning();

        if (telemetry.severity === RaidSeverity.CriticalRaid && !context.isQuarantined) {
            await this.database.update(entries).set({ isQuarantined: true }).where(eq(entries.id, entryId));
            await this.leaderboardCache.invalidateRound(roundId);
        }

        if (telemetry.severity !== RaidSeverity.Normal) {
            await this.eventBus.publish({
                type: RoundEventType.RaidAlert,
                roundId,
                entryId,
                severity: telemetry.severity,
                compositeScore: telemetry.compositeScore,
                occurredAt: new Date().toISOString()
            });
            if (await this.store.setIfAbsent(`raid-alert:${entryId}:${telemetry.severity}`, "1", this.options.alertCooldownSeconds)) {
                this.notifier.notify({
                    type: NotificationType.RaidAlert,
                    round: { id: roundId, title: context.roundTitle, pollType: context.pollType },
                    entry: { id: entryId, title: context.entryTitle },
                    severity: telemetry.severity,
                    flags: [...telemetry.flags],
                    velocityZScore: telemetry.velocityZScore,
                    quarantined: telemetry.severity === RaidSeverity.CriticalRaid
                });
            }
        }

        return record ?? null;
    }

    public stop(): void {
        for (const timer of this.timers) {
            clearTimeout(timer);
        }
        this.timers.clear();
    }

    private async scheduleEntry(roundId: string, entryId: string): Promise<void> {
        try {
            const acquired = await this.store.setIfAbsent(`raid-debounce:${entryId}`, "1", Math.ceil(this.options.debounceMs / 1000));
            if (!acquired) {
                return;
            }
            const timer = setTimeout(() => {
                this.timers.delete(timer);
                this.analyze(roundId, entryId).catch((error: unknown) => {
                    this.logger.error({ err: error, roundId, entryId }, "raid analysis failed");
                });
            }, this.options.debounceMs);
            timer.unref();
            this.timers.add(timer);
        } catch (error: unknown) {
            this.logger.error({ err: error, roundId, entryId }, "raid analysis scheduling failed");
        }
    }
}
