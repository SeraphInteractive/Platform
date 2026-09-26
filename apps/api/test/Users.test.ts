import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role, Specialty } from "../src/Domain/Roles.js";
import { createTestContext, json, nextSnowflake, serviceToken, type TestContext } from "./Support/TestApplication.js";

describe("user management", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    it("hides the member directory from regular users", async () => {
        const voter = await context.createUser(Role.Voter);
        const moderator = await context.createUser(Role.Moderator);
        expect((await context.application.inject({ method: "GET", url: "/api/v1/users", headers: voter.headers })).statusCode).toBe(403);
        const list = await context.application.inject({ method: "GET", url: "/api/v1/users?perPage=5", headers: moderator.headers });
        expect(list.statusCode).toBe(200);
        expect(json<{ meta: { perPage: number } }>(list).meta.perPage).toBe(5);
    });

    it("prevents supervisors from escalating privileges", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const target = await context.createUser(Role.Voter);
        const admin = await context.createUser(Role.Admin);

        const grantAdmin = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${target.record.id}/role`,
            headers: supervisor.headers,
            payload: { role: Role.Admin }
        });
        expect(grantAdmin.statusCode).toBe(403);

        const grantSelf = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${supervisor.record.id}/role`,
            headers: supervisor.headers,
            payload: { role: Role.Contributor }
        });
        expect(grantSelf.statusCode).toBe(403);

        const blacklistAdmin = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/${admin.record.id}/blacklist`,
            headers: supervisor.headers,
            payload: { reason: "nope" }
        });
        expect(blacklistAdmin.statusCode).toBe(403);

        const promote = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${target.record.id}/role`,
            headers: supervisor.headers,
            payload: { role: Role.Contributor, specialties: [Specialty.Animator, Specialty.Rigger] }
        });
        expect(promote.statusCode).toBe(200);
        expect(json<{ data: { role: string; specialties: string[] } }>(promote).data).toMatchObject({
            role: Role.Contributor,
            specialties: [Specialty.Animator, Specialty.Rigger]
        });
    });

    it("lets the bot service upsert roles below supervisor by Discord ID", async () => {
        const headers = { authorization: `Bearer ${serviceToken}` };
        const discordId = nextSnowflake();
        const created = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/by-discord/${discordId}/role`,
            headers,
            payload: { role: Role.Contributor, discordUsername: "botmade" }
        });
        expect(created.statusCode).toBe(200);
        expect(json<{ data: { discordId: string; username: string } }>(created).data).toMatchObject({ discordId, username: "botmade" });

        const escalate = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/by-discord/${discordId}/role`,
            headers,
            payload: { role: Role.Supervisor }
        });
        expect(escalate.statusCode).toBe(403);
    });

    it("blacklists and reinstates users", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const target = await context.createUser(Role.Voter);
        const blacklisted = await context.application.inject({
            method: "PUT",
            url: `/api/v1/users/by-discord/${target.record.discordId}/blacklist`,
            headers: supervisor.headers,
            payload: { reason: "vote brigading" }
        });
        expect(json<{ data: { isBlacklisted: boolean; blacklistReason: string } }>(blacklisted).data).toMatchObject({
            isBlacklisted: true,
            blacklistReason: "vote brigading"
        });
        const reinstated = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/users/${target.record.id}/blacklist`,
            headers: supervisor.headers
        });
        expect(json<{ data: { isBlacklisted: boolean } }>(reinstated).data.isBlacklisted).toBe(false);
    });

    it("validates presence lookups", async () => {
        const viewer = await context.createUser(Role.Voter);
        const anonymous = await context.application.inject({ method: "GET", url: `/api/v1/users/presence?ids=${nextSnowflake()}` });
        expect(anonymous.statusCode).toBe(401);
        const bad = await context.application.inject({
            method: "GET",
            url: "/api/v1/users/presence?ids=../../etc",
            headers: viewer.headers
        });
        expect(bad.statusCode).toBe(400);
        const good = await context.application.inject({
            method: "GET",
            url: `/api/v1/users/presence?ids=${nextSnowflake()}`,
            headers: viewer.headers
        });
        expect(good.statusCode).toBe(200);
    });
});
