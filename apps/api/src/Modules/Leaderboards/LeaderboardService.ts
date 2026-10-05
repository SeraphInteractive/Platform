import {
    aggregateScores,
    calculateBayesianShrinkage,
    evaluateLeadingSeparations,
    getScoringScheme,
    PollType,
    type Ballot,
    type EntryScoreBreakdown
} from "@platform/scoring";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { ConflictError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import type { AuthenticatedUser, UserActor } from "../../Common/Security/Principal.js";
import { canSeeDrafts } from "../Rounds/RoundVisibility.js";
import { EntryStatus, RoundStatus } from "../../Domain/Enums.js";
import { Role } from "../../Domain/Roles.js";
import type { Database, DatabaseExecutor } from "../../Infrastructure/Database/Database.js";
import {
    ballots,
    entries,
    roundResults,
    users,
    votingRounds,
    type RoundResultRecord,
    type VotingRoundRecord
} from "../../Infrastructure/Database/Schema.js";
import { RoundEventType, type EventBus } from "../../Infrastructure/Events/EventBus.js";
import { NotificationType, personOfActor, roundReferenceOf, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import type { LeaderboardCache } from "./LeaderboardCache.js";
import type { Leaderboard, LeaderboardItem } from "./LeaderboardTypes.js";

interface Standings {
    readonly leaderboard: Leaderboard;
    readonly ballots: readonly Ballot[];
}

const separationDepth = 5;

export class LeaderboardService {
    private readonly inflight = new Map<string, Promise<Leaderboard>>();

    public constructor(
        private readonly database: Database,
        private readonly cache: LeaderboardCache,
        private readonly eventBus: EventBus,
        private readonly notifier: Notifier,
        private readonly storage?: ObjectStorage
    ) {}

    public async getLive(roundId: string, viewer: AuthenticatedUser | null): Promise<Leaderboard> {
        const [round] = await this.database.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1);
        if (round === undefined || (round.status === RoundStatus.Draft && !canSeeDrafts(viewer))) {
            throw new NotFoundError("Round");
        }
        const cached = await this.cache.get(roundId);
        if (cached !== null) {
            return cached;
        }
        const pending = this.inflight.get(roundId);
        if (pending !== undefined) {
            return pending;
        }
        const computation = this.computeStandings(this.database, round)
            .then(async ({ leaderboard }) => {
                await this.cache.set(roundId, leaderboard);
                return leaderboard;
            })
            .finally(() => this.inflight.delete(roundId));
        this.inflight.set(roundId, computation);
        return computation;
    }

    public async getResult(roundId: string): Promise<RoundResultRecord> {
        const [result] = await this.database.select().from(roundResults).where(eq(roundResults.roundId, roundId)).limit(1);
        if (result === undefined) {
            throw new NotFoundError("Round result");
        }
        return result;
    }

    public async finalize(actor: UserActor, roundId: string): Promise<RoundResultRecord> {
        const { round, result } = await this.database.transaction(async (transaction) => {
            const [locked] = await transaction.select().from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1).for("update");
            if (locked === undefined) {
                throw new NotFoundError("Round");
            }
            if (locked.status === RoundStatus.Finalized) {
                throw new ConflictError("The round has already been finalized.", ErrorCode.RoundFinalized);
            }
            if (locked.status !== RoundStatus.Voting) {
                throw new ConflictError("The round must be in voting status before finalizing it.", ErrorCode.RoundNotClosed);
            }

            const standings = await this.computeStandings(transaction, locked);
            const scheme = getScoringScheme(locked.pollType);
            const separations = evaluateLeadingSeparations(
                standings.leaderboard.items.map((item) => this.toBreakdown(item)),
                standings.ballots,
                scheme,
                separationDepth
            );

            const [inserted] = await transaction
                .insert(roundResults)
                .values({
                    roundId,
                    totalBallots: standings.leaderboard.totalBallots,
                    totalPoints: standings.leaderboard.totalPoints,
                    isConserved: standings.leaderboard.isConserved,
                    leaderboard: standings.leaderboard.items,
                    separationResults: [...separations],
                    finalizedBy: actor.userId
                })
                .returning();
            await transaction.update(votingRounds).set({ status: RoundStatus.Finalized }).where(eq(votingRounds.id, roundId));
            if (inserted === undefined) {
                throw new Error("Round result insert returned no row.");
            }
            return { round: locked, result: inserted };
        });

        await this.cache.invalidateRound(roundId);
        await this.eventBus.publish({
            type: RoundEventType.RoundFinalized,
            roundId,
            resultId: result.id,
            occurredAt: new Date().toISOString()
        });

        const winner = result.leaderboard[0];
        let winnerMediaUrl: string | null = null;
        if (winner !== undefined && this.storage !== undefined) {
            const [winnerEntry] = await this.database
                .select({ mediaKey: entries.mediaKey })
                .from(entries)
                .where(eq(entries.id, winner.entryId))
                .limit(1);
            if (winnerEntry?.mediaKey) {
                winnerMediaUrl = this.storage.getPublicUrl(StorageBucket.Media, winnerEntry.mediaKey);
            }
        }
        this.notifier.notify({
            type: NotificationType.RoundFinalized,
            round: roundReferenceOf(round),
            totalBallots: result.totalBallots,
            winner:
                winner === undefined
                    ? null
                    : {
                          entryId: winner.entryId,
                          title: winner.title,
                          mediaUrl: winnerMediaUrl,
                          rawScore: winner.rawScore,
                          voteSharePercentage: winner.voteSharePercentage,
                          regularizedTotalScore: winner.regularizedTotalScore
                      },
            actor: personOfActor(actor)
        });
        return result;
    }

    public async finalizeExpired(): Promise<{ finalizedCount: number; roundIds: string[] }> {
        const now = new Date();
        const expired = await this.database
            .select({ id: votingRounds.id, createdBy: votingRounds.createdBy })
            .from(votingRounds)
            .where(and(eq(votingRounds.status, RoundStatus.Voting), isNotNull(votingRounds.closesAt), lte(votingRounds.closesAt, now)));

        const finalizedRoundIds: string[] = [];
        for (const round of expired) {
            try {
                // system actor for automated round conclusion
                const systemActor: UserActor = {
                    userId: round.createdBy,
                    role: Role.Admin,
                    displayName: "System",
                    discordId: "0"
                };
                await this.finalize(systemActor, round.id);
                finalizedRoundIds.push(round.id);
            } catch {
                // skip if already finalized or locked concurrently
            }
        }
        return { finalizedCount: finalizedRoundIds.length, roundIds: finalizedRoundIds };
    }

    private async computeStandings(executor: DatabaseExecutor, round: VotingRoundRecord): Promise<Standings> {
        const scheme = getScoringScheme(round.pollType);
        const [entryRows, ballotRows] = await Promise.all([
            executor
                .select({ id: entries.id, title: entries.title, status: entries.status, isQuarantined: entries.isQuarantined })
                .from(entries)
                .where(eq(entries.roundId, round.id)),
            executor
                .select({ voterId: ballots.voterId, rank1: ballots.rank1EntryId, rank2: ballots.rank2EntryId, rank3: ballots.rank3EntryId })
                .from(ballots)
                .innerJoin(users, eq(users.id, ballots.voterId))
                .where(and(eq(ballots.roundId, round.id), eq(users.isBlacklisted, false)))
        ]);

        const logicBallots: Ballot[] = ballotRows.map((row) => ({
            voterId: row.voterId,
            picks: [row.rank1, row.rank2, row.rank3].filter((pick): pick is string => pick !== null).slice(0, scheme.weights.length)
        }));
        const aggregation = aggregateScores(
            entryRows.map((entry) => entry.id),
            logicBallots,
            scheme
        );
        const eligible = new Map(
            entryRows
                .filter((entry) => entry.status === EntryStatus.Approved && !entry.isQuarantined)
                .map((entry) => [entry.id, entry.title])
        );

        const ranked = aggregation.leaderboard
            .filter((breakdown) => eligible.has(breakdown.entryId))
            .map((breakdown) => {
                const shrinkage =
                    round.pollType === PollType.RankedChoice
                        ? calculateBayesianShrinkage(breakdown, eligible.size, aggregation.totalBallots, scheme)
                        : null;
                return {
                    breakdown,
                    title: eligible.get(breakdown.entryId) ?? "",
                    regularizedMeanScore: shrinkage?.regularizedMeanScore ?? null,
                    regularizedTotalScore: shrinkage?.regularizedTotalScore ?? null
                };
            })
            .sort(
                (a, b) =>
                    (b.regularizedTotalScore ?? b.breakdown.rawScore) - (a.regularizedTotalScore ?? a.breakdown.rawScore) ||
                    b.breakdown.rawScore - a.breakdown.rawScore ||
                    a.breakdown.entryId.localeCompare(b.breakdown.entryId)
            );

        const items: LeaderboardItem[] = ranked.map((item, index) => ({
            position: index + 1,
            entryId: item.breakdown.entryId,
            title: item.title,
            rankCounts: [...item.breakdown.rankCounts],
            appearanceCount: item.breakdown.appearanceCount,
            rawScore: item.breakdown.rawScore,
            voteSharePercentage: item.breakdown.voteSharePercentage,
            regularizedMeanScore: item.regularizedMeanScore,
            regularizedTotalScore: item.regularizedTotalScore
        }));

        return {
            ballots: logicBallots,
            leaderboard: {
                roundId: round.id,
                pollType: round.pollType,
                totalBallots: aggregation.totalBallots,
                totalPoints: aggregation.totalPointsAwarded,
                isConserved: aggregation.isConserved,
                items,
                computedAt: new Date().toISOString()
            }
        };
    }

    private toBreakdown(item: LeaderboardItem): EntryScoreBreakdown {
        return {
            entryId: item.entryId,
            rankCounts: item.rankCounts,
            appearanceCount: item.appearanceCount,
            rawScore: item.rawScore,
            voteSharePercentage: item.voteSharePercentage
        };
    }
}
