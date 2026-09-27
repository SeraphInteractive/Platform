import type { PageQuery, ShotQuery } from "./PlatformApi";

export const queryKeys = {
    me: ["me"] as const,
    pipeline: ["pipeline"] as const,
    rounds: (query: PageQuery & { readonly status?: string }) => ["rounds", query] as const,
    roundsAll: ["rounds"] as const,
    round: (roundId: string) => ["round", roundId] as const,
    entries: (roundId: string, query: PageQuery & { readonly status?: string }) => ["round", roundId, "entries", query] as const,
    approvedEntries: (roundId: string) => ["round", roundId, "entries", "approved"] as const,
    leaderboard: (roundId: string) => ["round", roundId, "leaderboard"] as const,
    results: (roundId: string) => ["round", roundId, "results"] as const,
    myBallot: (roundId: string) => ["round", roundId, "ballot"] as const,
    ledger: (roundId: string, page: number) => ["round", roundId, "ledger", page] as const,
    telemetry: (roundId: string) => ["round", roundId, "telemetry"] as const,
    shots: (query: ShotQuery) => ["shots", query] as const,
    shotsAll: ["shots"] as const,
    shot: (shotId: string) => ["shot", shotId] as const,
    reviewQueue: (query: PageQuery) => ["reviews", query] as const,
    reviewsAll: ["reviews"] as const,
    users: (query: PageQuery & { readonly role?: string }) => ["users", query] as const,
    usersAll: ["users"] as const,
    entry: (roundId: string, entryId: string) => ["round", roundId, "entry", entryId] as const,
    entryTelemetry: (roundId: string, entryId: string) => ["round", roundId, "telemetry", entryId] as const,
    presence: (discordIds: readonly string[]) => ["presence", [...discordIds].sort().join(",")] as const,
    threadMaps: ["thread-maps"] as const
};
