import { RaidSeverity } from "@platform/scoring";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntryStatus, PollType, RoundStatus } from "../src/Domain/Enums.js";
import { Role } from "../src/Domain/Roles.js";
import { entries, users } from "../src/Infrastructure/Database/Schema.js";
import { NotificationType } from "../src/Infrastructure/Notifications/Notification.js";
import { StorageBucket } from "../src/Infrastructure/Storage/ObjectStorage.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";

interface Envelope<T> {
    readonly data: T;
}

describe("voting rounds", () => {
    let context: TestContext;
    let supervisor: TestUser;
    let admin: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);
        admin = await context.createUser(Role.Admin);
    });

    afterAll(async () => {
        await context.close();
    });

    async function createRound(pollType: PollType): Promise<string> {
        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: pollType === PollType.Binary ? admin.headers : supervisor.headers,
            payload: { title: `Round ${pollType}`, pollType }
        });
        expect(response.statusCode).toBe(201);
        return json<Envelope<{ id: string }>>(response).data.id;
    }

    async function addEntry(roundId: string, author: TestUser, title: string): Promise<string> {
        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: author.headers,
            payload: { title }
        });
        expect(response.statusCode).toBe(201);
        return json<Envelope<{ id: string }>>(response).data.id;
    }

    async function approveEntry(roundId: string, approver: TestUser, entryId: string): Promise<void> {
        const response = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}/entries/${entryId}/status`,
            headers: approver.headers,
            payload: { status: EntryStatus.Approved }
        });
        expect(response.statusCode).toBe(200);
    }

    async function setRoundStatus(roundId: string, status: RoundStatus): Promise<number> {
        const response = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers,
            payload: { status }
        });
        return response.statusCode;
    }

    async function vote(voter: TestUser, roundId: string, picks: string[]): Promise<number> {
        const response = await context.application.inject({
            method: "PUT",
            url: `/api/v1/rounds/${roundId}/ballots/me`,
            headers: voter.headers,
            payload: { picks }
        });
        return response.statusCode;
    }

    it("runs a ranked-choice round from draft to certified results", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        const community = await context.createUser(Role.Voter);

        // submissions are blocked while round is in draft
        const draftSubmission = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: community.headers,
            payload: { title: "Draft pitch" }
        });
        expect(draftSubmission.statusCode).toBe(409);

        const draftForPublic = await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}` });
        expect(draftForPublic.statusCode).toBe(404);
        const draftForStaff = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers
        });
        expect(draftForStaff.statusCode).toBe(200);

        expect(await setRoundStatus(roundId, RoundStatus.Open)).toBe(200);

        const pendingId = await addEntry(roundId, community, "Community pitch");
        const aAuthor = await context.createUser(Role.Voter);
        const bAuthor = await context.createUser(Role.Voter);
        const cAuthor = await context.createUser(Role.Voter);
        const a = await addEntry(roundId, aAuthor, "A");
        const b = await addEntry(roundId, bAuthor, "B");
        const c = await addEntry(roundId, cAuthor, "C");
        await approveEntry(roundId, supervisor, a);
        await approveEntry(roundId, supervisor, b);
        await approveEntry(roundId, supervisor, c);

        const voter = await context.createUser(Role.Voter);

        const publicList = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/entries?status=pending_review`
        });
        expect(json<{ data: { id: string }[] }>(publicList).data.map((entry) => entry.id)).not.toContain(pendingId);
        const hidden = await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/entries/${pendingId}` });
        expect(hidden.statusCode).toBe(404);

        // voting is blocked while round is still in submission (open) stage
        expect(await vote(voter, roundId, [a, b, c])).toBe(409);

        // cannot transition to voting if criteria not met, but 3 approved entries is valid for ranked choice
        expect(await setRoundStatus(roundId, RoundStatus.Voting)).toBe(200);

        // submissions are blocked once round enters voting stage
        const lateSubmission = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: community.headers,
            payload: { title: "Late pitch" }
        });
        expect(lateSubmission.statusCode).toBe(409);

        expect(await vote(voter, roundId, [a, a, b])).toBe(422);
        expect(await vote(voter, roundId, [a, b, pendingId])).toBe(422);
        expect(await vote(voter, roundId, [a, b])).toBe(422);
        expect(await vote(voter, roundId, [a, b, c])).toBe(200);
        expect(await vote(voter, roundId, [b, a, c])).toBe(200);

        const second = await context.createUser(Role.Voter);
        expect(await vote(second, roundId, [b, c, a])).toBe(200);

        const blacklisted = await context.createUser(Role.Voter, { isBlacklisted: true, blacklistReason: "alt account" });
        expect(await vote(blacklisted, roundId, [c, a, b])).toBe(403);
        expect(context.notifier.notifications.some((notification) => notification.type === NotificationType.BallotBlocked)).toBe(true);

        const mine = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/ballots/me`,
            headers: voter.headers
        });
        expect(json<Envelope<{ picks: string[] }>>(mine).data.picks).toEqual([b, a, c]);

        const leaderboard = json<Envelope<{ totalBallots: number; isConserved: boolean; items: { entryId: string; rawScore: number }[] }>>(
            await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/leaderboard` })
        ).data;
        expect(leaderboard.totalBallots).toBe(2);
        expect(leaderboard.isConserved).toBe(true);
        expect(leaderboard.items[0]).toMatchObject({ entryId: b, rawScore: 6 });

        const ledger = await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/ballots` });
        const ledgerBody = ledger.body;
        expect(ledgerBody).not.toContain(voter.record.id);
        expect(json<{ data: { voter: string }[] }>(ledger).data).toHaveLength(2);

        // cannot backtrack state from voting to open
        expect(await setRoundStatus(roundId, RoundStatus.Open)).toBe(409);

        const finalized = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/finalize`,
            headers: supervisor.headers
        });
        expect(finalized.statusCode).toBe(200);
        const result = json<Envelope<{ leaderboard: { entryId: string }[]; separations: unknown[] }>>(finalized).data;
        expect(result.leaderboard[0]?.entryId).toBe(b);
        expect(result.separations.length).toBeGreaterThan(0);

        const results = await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/results` });
        expect(results.statusCode).toBe(200);
        expect(await vote(second, roundId, [a, b, c])).toBe(409);
        expect(await setRoundStatus(roundId, RoundStatus.Open)).toBe(409);
        expect(await setRoundStatus(roundId, RoundStatus.Voting)).toBe(409);
        const deletion = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers
        });
        expect(deletion.statusCode).toBe(409);
    });

    it("excludes blacklisted voters from live standings", async () => {
        const roundId = await createRound(PollType.Binary);
        await setRoundStatus(roundId, RoundStatus.Open);
        const yesAuthor = await context.createUser(Role.Voter);
        const noAuthor = await context.createUser(Role.Voter);
        const yes = await addEntry(roundId, yesAuthor, "Yes");
        const no = await addEntry(roundId, noAuthor, "No");
        await approveEntry(roundId, supervisor, yes);
        await approveEntry(roundId, supervisor, no);
        expect(await setRoundStatus(roundId, RoundStatus.Voting)).toBe(200);
        const honest = await context.createUser(Role.Voter);
        const brigader = await context.createUser(Role.Voter);
        expect(await vote(honest, roundId, [yes])).toBe(200);
        expect(await vote(brigader, roundId, [no])).toBe(200);
        expect(await vote(brigader, roundId, [no, yes])).toBe(422);

        await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/${brigader.record.id}/blacklist`,
            headers: supervisor.headers,
            payload: { reason: "brigading" }
        });
        const leaderboard = json<Envelope<{ totalBallots: number; items: { entryId: string; voteSharePercentage: number }[] }>>(
            await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/leaderboard` })
        ).data;
        expect(leaderboard.totalBallots).toBe(1);
        expect(leaderboard.items[0]).toMatchObject({ entryId: yes, voteSharePercentage: 100 });
    });

    it("does not quarantine a popular binary option", async () => {
        const roundId = await createRound(PollType.Binary);
        await setRoundStatus(roundId, RoundStatus.Open);
        const popularAuthor = await context.createUser(Role.Voter);
        const otherAuthor = await context.createUser(Role.Voter);
        const popular = await addEntry(roundId, popularAuthor, "Popular");
        const other = await addEntry(roundId, otherAuthor, "Other");
        await approveEntry(roundId, supervisor, popular);
        await approveEntry(roundId, supervisor, other);
        expect(await setRoundStatus(roundId, RoundStatus.Voting)).toBe(200);
        for (let index = 0; index < 12; index++) {
            const voter = await context.createUser(Role.Voter);
            expect(await vote(voter, roundId, [popular])).toBe(200);
        }
        const telemetry = await context.services.raidMonitor.analyze(roundId, popular);
        expect(telemetry?.severity).not.toBe(RaidSeverity.CriticalRaid);
        const [entry] = await context.database.select().from(entries).where(eq(entries.id, popular));
        expect(entry?.isQuarantined).toBe(false);
    });

    it("guards entry moderation and deletion", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        await setRoundStatus(roundId, RoundStatus.Open);
        const voter = await context.createUser(Role.Voter);
        const entryId = await addEntry(roundId, voter, "Needs review");

        const forbidden = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}/entries/${entryId}/status`,
            headers: voter.headers,
            payload: { status: EntryStatus.Approved }
        });
        expect(forbidden.statusCode).toBe(403);

        const approved = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}/entries/${entryId}/status`,
            headers: supervisor.headers,
            payload: { status: EntryStatus.Approved }
        });
        expect(json<Envelope<{ status: string }>>(approved).data.status).toBe(EntryStatus.Approved);

        const bAuthor = await context.createUser(Role.Voter);
        const cAuthor = await context.createUser(Role.Voter);
        const b = await addEntry(roundId, bAuthor, "B");
        const c = await addEntry(roundId, cAuthor, "C");
        await approveEntry(roundId, supervisor, b);
        await approveEntry(roundId, supervisor, c);
        expect(await setRoundStatus(roundId, RoundStatus.Voting)).toBe(200);
        expect(await vote(voter, roundId, [entryId, b, c])).toBe(200);

        const deletion = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/rounds/${roundId}/entries/${entryId}`,
            headers: admin.headers
        });
        expect(deletion.statusCode).toBe(409);
        expect(json(deletion).code).toBe("ENTRY_HAS_BALLOTS");

        const secondAttempt = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: voter.headers,
            payload: { title: "Second entry" }
        });
        expect(secondAttempt.statusCode).toBe(409);

        const otherVoter = await context.createUser(Role.Voter);
        const media = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: otherVoter.headers,
            payload: { title: "Sneaky", mediaKey: `media/${admin.record.id}/00000000-0000-4000-8000-000000000000.png` }
        });
        expect(media.statusCode).toBe(422);
    });

    it("blocks blacklisted users from proposing entries", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        await setRoundStatus(roundId, RoundStatus.Open);
        const banned = await context.createUser(Role.Voter);
        await context.database.update(users).set({ isBlacklisted: true }).where(eq(users.id, banned.record.id));
        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: banned.headers,
            payload: { title: "Nope" }
        });
        expect(response.statusCode).toBe(403);
    });

    it("enforces a maximum of 5 approved entries per round", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        await setRoundStatus(roundId, RoundStatus.Open);
        const entryIds: string[] = [];
        for (let i = 0; i < 6; i++) {
            const author = await context.createUser(Role.Voter);
            entryIds.push(await addEntry(roundId, author, `Option ${i + 1}`));
        }

        // approve first 5 entries
        for (let i = 0; i < 5; i++) {
            await approveEntry(roundId, supervisor, entryIds[i]!);
        }

        // 6th approval should fail with 409
        const sixthApproval = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}/entries/${entryIds[5]}/status`,
            headers: supervisor.headers,
            payload: { status: EntryStatus.Approved }
        });
        expect(sixthApproval.statusCode).toBe(409);
        expect(json(sixthApproval).detail).toContain("maximum of 5 approved entries");
    });

    it("scans uploaded entry media for AI metadata and notifies supervisors", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        await setRoundStatus(roundId, RoundStatus.Open);
        const author = await context.createUser(Role.Voter);

        // create synthetic PNG with Stable Diffusion parameters in tEXt chunk
        const prompt = "Cyberpunk staircase\nSteps: 20, Sampler: Euler a, CFG scale: 7";
        const textPayload = Buffer.concat([
            Buffer.from("parameters", "latin1"),
            Buffer.from([0x00]),
            Buffer.from(prompt, "utf-8")
        ]);
        const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const ihdr = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x0d]), Buffer.from("IHDR", "ascii"), Buffer.alloc(13), Buffer.alloc(4)]);
        const customLen = Buffer.alloc(4);
        customLen.writeUInt32BE(textPayload.length, 0);
        const customChunk = Buffer.concat([customLen, Buffer.from("tEXt", "ascii"), textPayload, Buffer.alloc(4)]);
        const iend = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("IEND", "ascii"), Buffer.alloc(4)]);
        const pngBuf = Buffer.concat([signature, ihdr, customChunk, iend]);

        const mediaKey = `media/${author.record.id}/11111111-2222-3333-4444-555555555555.png`;
        context.storage.store(StorageBucket.Media, mediaKey, pngBuf.length, "image/png", pngBuf);

        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: author.headers,
            payload: { title: "AI Generated Entry", mediaKey }
        });
        expect(response.statusCode).toBe(201);
        const createdEntry = json<Envelope<{ id: string; aiFlags: string[] }>>(response).data;
        expect(createdEntry.aiFlags.length).toBeGreaterThan(0);
        expect(createdEntry.aiFlags).toContain("PNG parameters chunk (Stable Diffusion / WebUI)");

        // verify notification was emitted
        const aiNotif = context.notifier.notifications.find(
            (n) => n.type === NotificationType.MediaFlaggedAi && n.targetId === createdEntry.id
        );
        expect(aiNotif).toBeDefined();
        if (aiNotif && aiNotif.type === NotificationType.MediaFlaggedAi) {
            expect(aiNotif.mediaKind).toBe("entry");
            expect(aiNotif.flags).toContain("PNG parameters chunk (Stable Diffusion / WebUI)");
        }
    });
});
