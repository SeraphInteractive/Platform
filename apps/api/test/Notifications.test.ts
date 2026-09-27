import { actingUserHeader, NotificationType, platformNotificationSchema } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntryStatus, PollType, RoundStatus } from "../src/Domain/Enums.js";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, nextSnowflake, serviceToken, type TestContext } from "./Support/TestApplication.js";

interface Envelope<T> {
    readonly data: T;
}

const serviceHeaders = { authorization: `Bearer ${serviceToken}` };

describe("platform service integration", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    it("syncs Discord profiles without letting the service escalate roles", async () => {
        const discordId = nextSnowflake();
        const synced = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/by-discord/${discordId}/profile`,
            headers: serviceHeaders,
            payload: { username: "BotUser", avatar: null }
        });
        expect(synced.statusCode).toBe(200);
        expect(json<Envelope<{ role: string; username: string }>>(synced).data).toMatchObject({ role: Role.Member, username: "BotUser" });

        const user = await context.createUser(Role.Voter);
        const forbidden = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/by-discord/${discordId}/profile`,
            headers: user.headers,
            payload: { username: "Hijack" }
        });
        expect(forbidden.statusCode).toBe(403);
    });

    it("acts on behalf of Discord users with their own permissions", async () => {
        const voter = await context.createUser(Role.Voter);
        const supervisor = await context.createUser(Role.Supervisor);

        const asVoter = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: { ...serviceHeaders, [actingUserHeader]: voter.record.discordId }
        });
        expect(json<Envelope<{ id: string }>>(asVoter).data.id).toBe(voter.record.id);

        const voterCreatesRound = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: { ...serviceHeaders, [actingUserHeader]: voter.record.discordId },
            payload: { title: "Nope" }
        });
        expect(voterCreatesRound.statusCode).toBe(403);

        const supervisorCreatesRound = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: { ...serviceHeaders, [actingUserHeader]: supervisor.record.discordId },
            payload: { title: "Via Discord" }
        });
        expect(supervisorCreatesRound.statusCode).toBe(201);
        expect(json<Envelope<{ createdBy: string }>>(supervisorCreatesRound).data.createdBy).toBe(supervisor.record.id);

        const userImpersonation = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: { ...voter.headers, [actingUserHeader]: supervisor.record.discordId }
        });
        expect(userImpersonation.statusCode).toBe(403);

        const unlinked = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: { ...serviceHeaders, [actingUserHeader]: nextSnowflake() }
        });
        expect(json(unlinked).code).toBe("ACCOUNT_NOT_LINKED");

        const logout = await context.application.inject({
            method: "DELETE",
            url: "/api/v1/auth/session",
            headers: { ...serviceHeaders, [actingUserHeader]: voter.record.discordId }
        });
        expect(logout.statusCode).toBe(403);
    });

    it("streams notifications to the service and resumes from Last-Event-ID", async () => {
        const address = await context.application.listen({ host: "127.0.0.1", port: 0 });
        const supervisor = await context.createUser(Role.Supervisor);
        const baseline = await context.notificationLog.latestId();

        const denied = await fetch(`${address}/api/v1/notifications/stream`, { headers: supervisor.headers });
        expect(denied.status).toBe(403);

        const controller = new AbortController();
        const response = await fetch(`${address}/api/v1/notifications/stream`, {
            headers: { ...serviceHeaders, "last-event-id": baseline },
            signal: controller.signal
        });
        expect(response.headers.get("content-type")).toContain("text/event-stream");

        await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: supervisor.headers,
            payload: { title: "Streamed round", pollType: PollType.Binary }
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let received = "";
        while (reader !== undefined && !received.includes("event: notification")) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            received += decoder.decode(chunk.value);
        }
        controller.abort();

        const data = /data: (.+)\n/u.exec(received)?.[1] ?? "{}";
        const parsed = platformNotificationSchema.parse(JSON.parse(data));
        expect(parsed.type).toBe(NotificationType.RoundCreated);
        expect(received).toMatch(/id: \d+-\d+/u);
    });

    it("emits notifications that match the published contract", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const voter = await context.createUser(Role.Voter);
        const round = json<Envelope<{ id: string }>>(
            await context.application.inject({
                method: "POST",
                url: "/api/v1/rounds",
                headers: supervisor.headers,
                payload: { title: "Contract", pollType: PollType.Binary }
            })
        ).data;
        const entryIds: string[] = [];
        for (const title of ["A", "B"]) {
            const entry = await context.application.inject({
                method: "POST",
                url: `/api/v1/rounds/${round.id}/entries`,
                headers: supervisor.headers,
                payload: { title }
            });
            const entryId = json<Envelope<{ id: string }>>(entry).data.id;
            entryIds.push(entryId);
            await context.application.inject({
                method: "PATCH",
                url: `/api/v1/rounds/${round.id}/entries/${entryId}/status`,
                headers: supervisor.headers,
                payload: { status: EntryStatus.Approved }
            });
        }
        await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${round.id}`,
            headers: supervisor.headers,
            payload: { title: "Contract Renamed" }
        });
        await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${round.id}`,
            headers: supervisor.headers,
            payload: { status: RoundStatus.Open }
        });
        await context.application.inject({
            method: "PUT",
            url: `/api/v1/rounds/${round.id}/ballots/me`,
            headers: voter.headers,
            payload: { picks: [entryIds[0]] }
        });
        await context.application.inject({
            method: "PATCH",
            url: `/api/v1/rounds/${round.id}`,
            headers: supervisor.headers,
            payload: { status: RoundStatus.Closed }
        });
        await context.application.inject({ method: "POST", url: `/api/v1/rounds/${round.id}/finalize`, headers: supervisor.headers });
        await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/${voter.record.id}/blacklist`,
            headers: supervisor.headers,
            payload: { reason: "test" }
        });
        await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: { sceneNumber: 1, shotCode: "NT-1", title: "Notify", difficultyTier: "easy" }
        });
        await context.application.inject({
            method: "POST",
            url: "/api/v1/pipeline/progress",
            headers: supervisor.headers,
            payload: {
                stepIndex: 1,
                stepId: "0.2",
                stepTitle: "Story Vote",
                phaseNumber: 0,
                phaseTitle: "Phase 0: Pre-Production",
                progressPercent: 7,
                isPhaseTransition: false
            }
        });
        const pipeline = await context.application.inject({ method: "GET", url: "/api/v1/pipeline" });
        expect(json<Envelope<{ stepId: string; progressPercent: number; updatedAt: string | null }>>(pipeline).data).toMatchObject({
            stepId: "0.2",
            progressPercent: 7
        });

        await new Promise((resolve) => setTimeout(resolve, 10));
        const types = new Set<string>();
        for (const entry of context.notificationLog.entries) {
            const parsed = platformNotificationSchema.safeParse(JSON.parse(entry.payload));
            expect(parsed.success, entry.payload).toBe(true);
            if (parsed.success) {
                types.add(parsed.data.type);
            }
        }
        for (const expected of [
            NotificationType.RoundCreated,
            NotificationType.RoundUpdated,
            NotificationType.EntrySubmitted,
            NotificationType.RoundStatusChanged,
            NotificationType.BallotSubmitted,
            NotificationType.RoundFinalized,
            NotificationType.UserBlacklisted,
            NotificationType.ShotCreated,
            NotificationType.PipelineUpdated
        ]) {
            expect(types.has(expected), expected).toBe(true);
        }
    });
});
