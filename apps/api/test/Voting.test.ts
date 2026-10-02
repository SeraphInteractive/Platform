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

    async function createRound(pollType: PollType, binaryEntries?: [{ title: string }, { title: string }]): Promise<string> {
        const payload: Record<string, unknown> = { title: `Round ${pollType}`, pollType };
        if (pollType === PollType.Binary) {
            payload.binaryEntries = binaryEntries ?? [{ title: "Option A" }, { title: "Option B" }];
        }
        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: supervisor.headers,
            payload
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
        const dAuthor = await context.createUser(Role.Voter);
        const eAuthor = await context.createUser(Role.Voter);
        const a = await addEntry(roundId, aAuthor, "A");
        const b = await addEntry(roundId, bAuthor, "B");
        const c = await addEntry(roundId, cAuthor, "C");
        const d = await addEntry(roundId, dAuthor, "D");
        const e = await addEntry(roundId, eAuthor, "E");
        await approveEntry(roundId, supervisor, a);
        await approveEntry(roundId, supervisor, b);
        await approveEntry(roundId, supervisor, c);
        await approveEntry(roundId, supervisor, d);
        await approveEntry(roundId, supervisor, e);

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

        // public / non-supervisor cannot access ledger
        const unauthed = await context.application.inject({ method: "GET", url: `/api/v1/rounds/${roundId}/ballots` });
        expect(unauthed.statusCode).toBe(401);

        const voterLedger = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/ballots`,
            headers: voter.headers
        });
        expect(voterLedger.statusCode).toBe(403);

        const ledger = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/ballots`,
            headers: supervisor.headers
        });
        expect(ledger.statusCode).toBe(200);
        const ledgerData = json<{ data: { discordId: string; discordUsername: string; picks: string[] }[] }>(ledger).data;
        expect(ledgerData).toHaveLength(2);
        expect(ledgerData.some((row) => row.discordId === voter.record.discordId && row.discordUsername === voter.record.discordUsername)).toBe(true);

        // updates dynamically if user changes discord username
        await context.database.update(users).set({ discordUsername: "renamed_voter" }).where(eq(users.id, voter.record.id));
        const updatedLedger = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/ballots`,
            headers: supervisor.headers
        });
        const updatedData = json<{ data: { discordId: string; discordUsername: string }[] }>(updatedLedger).data;
        expect(updatedData.some((row) => row.discordId === voter.record.discordId && row.discordUsername === "renamed_voter")).toBe(true);

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

        // admin can edit finalized round
        const adminUpdate = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: admin.headers,
            payload: { title: "Updated Finalized Title" }
        });
        expect(adminUpdate.statusCode).toBe(200);

        // admin can delete finalized round
        const adminDeletion = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/rounds/${roundId}`,
            headers: admin.headers
        });
        expect(adminDeletion.statusCode).toBe(204);
    });

    it("excludes blacklisted voters from live standings", async () => {
        const roundId = await createRound(PollType.Binary, [{ title: "Yes" }, { title: "No" }]);
        const roundEntries = await context.database
            .select()
            .from(entries)
            .where(eq(entries.roundId, roundId))
            .orderBy(entries.createdAt, entries.id);
        const yes = roundEntries[0]!.id;
        const no = roundEntries[1]!.id;
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

        const binaryLedger = await context.application.inject({
            method: "GET",
            url: `/api/v1/rounds/${roundId}/ballots`,
            headers: supervisor.headers
        });
        expect(binaryLedger.statusCode).toBe(200);
        const binaryData = json<{ data: { discordId: string; picks: string[] }[] }>(binaryLedger).data;
        expect(binaryData).toHaveLength(1);
        expect(binaryData[0]?.discordId).toBe(honest.record.discordId);
        expect(binaryData[0]?.picks).toEqual([yes]);
    });

    it("does not quarantine a popular binary option", async () => {
        const roundId = await createRound(PollType.Binary, [{ title: "Popular" }, { title: "Other" }]);
        const roundEntries = await context.database
            .select()
            .from(entries)
            .where(eq(entries.roundId, roundId))
            .orderBy(entries.createdAt, entries.id);
        const popular = roundEntries[0]!.id;
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

    it("blocks public users from proposing entries in binary rounds", async () => {
        const roundId = await createRound(PollType.Binary);
        const voter = await context.createUser(Role.Voter);
        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: voter.headers,
            payload: { title: "Public idea" }
        });
        expect(response.statusCode).toBe(403);
    });

    it("requires exactly two choices when creating a binary round and allows updating them", async () => {
        // missing binaryEntries
        const invalidCreation = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: supervisor.headers,
            payload: { title: "Binary Missing Options", pollType: PollType.Binary }
        });
        expect(invalidCreation.statusCode).toBe(400);

        // supervisor creates binary round with Option A and Option B
        const validCreation = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: supervisor.headers,
            payload: {
                title: "Binary Choice Round",
                pollType: PollType.Binary,
                binaryEntries: [
                    { title: "Original Option A", description: "First choice" },
                    { title: "Original Option B", description: "Second choice" }
                ]
            }
        });
        expect(validCreation.statusCode).toBe(201);
        const roundId = json<Envelope<{ id: string }>>(validCreation).data.id;

        // verify the 2 entries exist and are approved
        const initialEntries = await context.database
            .select()
            .from(entries)
            .where(eq(entries.roundId, roundId))
            .orderBy(entries.createdAt, entries.id);
        expect(initialEntries).toHaveLength(2);
        expect(initialEntries[0]?.title).toBe("Original Option A");
        expect(initialEntries[0]?.status).toBe(EntryStatus.Approved);

        // supervisor updates binary entries while in Draft
        const draftUpdate = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers,
            payload: {
                binaryEntries: [
                    { id: initialEntries[0]?.id, title: "Updated Option A", description: "New A description" },
                    { id: initialEntries[1]?.id, title: "Updated Option B", description: "New B description" }
                ]
            }
        });
        expect(draftUpdate.statusCode).toBe(200);

        // supervisor transitions directly Draft -> Voting
        const votingTransition = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers,
            payload: { status: RoundStatus.Voting }
        });
        expect(votingTransition.statusCode).toBe(200);

        // supervisor updates binary entries during Voting
        const votingUpdate = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${roundId}`,
            headers: supervisor.headers,
            payload: {
                binaryEntries: [
                    { id: initialEntries[0]?.id, title: "Live Option A" },
                    { id: initialEntries[1]?.id, title: "Live Option B" }
                ]
            }
        });
        expect(votingUpdate.statusCode).toBe(200);

        // cannot delete single entry from binary round
        const entryDeletion = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/rounds/${roundId}/entries/${initialEntries[0]!.id}`,
            headers: admin.headers
        });
        expect(entryDeletion.statusCode).toBe(409);
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
        const dAuthor = await context.createUser(Role.Voter);
        const eAuthor = await context.createUser(Role.Voter);
        const b = await addEntry(roundId, bAuthor, "B");
        const c = await addEntry(roundId, cAuthor, "C");
        const d = await addEntry(roundId, dAuthor, "D");
        const e = await addEntry(roundId, eAuthor, "E");
        await approveEntry(roundId, supervisor, b);
        await approveEntry(roundId, supervisor, c);
        await approveEntry(roundId, supervisor, d);
        await approveEntry(roundId, supervisor, e);
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

    it("enforces single entry limit for non-admin users and allows multiple entries for admins", async () => {
        const roundId = await createRound(PollType.RankedChoice);
        await setRoundStatus(roundId, RoundStatus.Open);
        const voter = await context.createUser(Role.Voter);

        const first = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: voter.headers,
            payload: { title: "Voter Entry 1" }
        });
        expect(first.statusCode).toBe(201);

        const second = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: voter.headers,
            payload: { title: "Voter Entry 2" }
        });
        expect(second.statusCode).toBe(409);

        const supFirst = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: supervisor.headers,
            payload: { title: "Supervisor Entry 1" }
        });
        expect(supFirst.statusCode).toBe(201);

        const supSecond = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: supervisor.headers,
            payload: { title: "Supervisor Entry 2" }
        });
        expect(supSecond.statusCode).toBe(409);

        const adminFirst = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: admin.headers,
            payload: { title: "Admin Entry 1" }
        });
        expect(adminFirst.statusCode).toBe(201);

        const adminSecond = await context.application.inject({
            method: "POST",
            url: `/api/v1/rounds/${roundId}/entries`,
            headers: admin.headers,
            payload: { title: "Admin Entry 2" }
        });
        expect(adminSecond.statusCode).toBe(201);
    });
});
