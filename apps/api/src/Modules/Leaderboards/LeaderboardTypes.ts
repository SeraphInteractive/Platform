import type { LeaderboardDto, LeaderboardItemDto, RoundResultDto } from "@platform/contracts";

export { leaderboardItemSchema, leaderboardSchema, roundResultSchema, separationSchema } from "@platform/contracts";

export type LeaderboardItem = LeaderboardItemDto;
export type Leaderboard = LeaderboardDto;
export type RoundResultResponse = RoundResultDto;
