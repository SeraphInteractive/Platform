import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PollType, RoundStatus } from "../../src/Domain/Enums.js";
import { Role } from "../../src/Domain/Roles.js";
import { entries } from "../../src/Infrastructure/Database/Schema.js";
import { createTestContext, json, type TestContext, type TestUser } from "../Support/TestApplication.js";

interface LeaderboardItem {
    entryId: string;
    title: string;
    rawScore: number;
    voteSharePercentage: number;
}

interface LeaderboardDto {
    roundId: string;
    totalBallots: number;
    totalPoints: number;
    items: LeaderboardItem[];
}

describe("LeaderboardQuarantineSkew defect reproducer (B6)", () => {
    let context: TestContext;
    let supervisor: TestUser;
    let voter1: TestUser;
    let voter2: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);
        voter1 = await context.createUser(Role.Voter);
        voter2 = await context.createUser(Role.Voter);
    });

    afterAll(async () => {
        await context.close();
    });

    it("ensures totalPoints and vote shares normalize to 100% when an entry is quarantined in binary polls", async () => {
        // create binary round with two options
        const roundRes = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: supervisor.headers,
            payload: {
                title: "Binary Community Choice",
                pollType: PollType.Binary,
                binaryEntries: [{ title: "Legitimate Entry" }, { title: "Raid Brigaded Entry" }]
            }
        });
        expect(roundRes.statusCode).toBe(201);
        const roundId = json<{ data: { id: string } }>(roundRes).data.id;

        // open round for voting
        const openRes = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers,
            payload: { status: RoundStatus.Voting }
        });
        expect(openRes.statusCode).toBe(200);

        // fetch created entries
        const roundEntries = await context.database.select().from(entries).where(eq(entries.roundId, roundId));
        expect(roundEntries).toHaveLength(2);
        const [cleanEntry, badEntry] = roundEntries;
        expect(cleanEntry).toBeDefined();
        expect(badEntry).toBeDefined();

        // voters cast ballots for clean and bad entry
        const vote1Res = await context.application.inject({
            method: "PUT",
            url: `/api/v1/rounds/${roundId}/ballots/me`,
            headers: voter1.headers,
            payload: { picks: [cleanEntry!.id] }
        });
        expect(vote1Res.statusCode).toBe(200);

        const vote2Res = await context.application.inject({
            method: "PUT",
            url: `/api/v1/rounds/${roundId}/ballots/me`,
            headers: voter2.headers,
            payload: { picks: [badEntry!.id] }
        });
        expect(vote2Res.statusCode).toBe(200);

        // staff or raid monitor quarantines the brigaded entry
        await context.database.update(entries).set({ isQuarantined: true }).where(eq(entries.id, badEntry!.id));

        // fetch public live leaderboard
        const leaderboardRes = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/leaderboard`
        });
        expect(leaderboardRes.statusCode).toBe(200);
        const leaderboard = json<{ data: LeaderboardDto }>(leaderboardRes).data;

        // the quarantined entry must not appear in public items
        expect(leaderboard.items.map((item) => item.entryId)).not.toContain(badEntry!.id);

        const sumOfItemScores = leaderboard.items.reduce((sum, item) => sum + item.rawScore, 0);
        const sumOfVoteShares = leaderboard.items.reduce((sum, item) => sum + item.voteSharePercentage, 0);

        // invariant: leaderboard totalPoints must equal the sum of visible item raw scores
        // against current code, totalPoints is 2 (includes quarantined entry) while visible sum is 1
        expect(leaderboard.totalPoints).toBe(sumOfItemScores);

        // invariant: visible vote share percentages must total 100% of the active eligible pool
        // against current code, clean entry receives only 50% while 50% is lost to phantom quarantined entry
        expect(sumOfVoteShares).toBeCloseTo(100, 1);
    });
});
