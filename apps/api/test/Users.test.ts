import { NotificationType } from "@platform/contracts";
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

    it("hides the member directory from regular users but allows moderators and service tokens", async () => {
        const voter = await context.createUser(Role.Voter);
        const moderator = await context.createUser(Role.Moderator);
        expect((await context.application.inject({ method: "GET", url: "/api/v1/users", headers: voter.headers })).statusCode).toBe(403);
        const list = await context.application.inject({ method: "GET", url: "/api/v1/users?perPage=5", headers: moderator.headers });
        expect(list.statusCode).toBe(200);
        expect(json<{ meta: { perPage: number } }>(list).meta.perPage).toBe(5);

        const serviceList = await context.application.inject({
            method: "GET",
            url: "/api/v1/users?perPage=5",
            headers: { authorization: `Bearer ${serviceToken}` }
        });
        expect(serviceList.statusCode).toBe(200);
        expect(json<{ meta: { perPage: number } }>(serviceList).meta.perPage).toBe(5);
    });

    it("lets users choose craft specialties but keeps assigned leadership ones", async () => {
        const user = await context.createUser(Role.Contributor, { specialties: [Specialty.Producer] });
        expect(
            json<{ data: { isOnboarded: boolean } }>(
                await context.application.inject({ method: "GET", url: "/api/v1/auth/me", headers: user.headers })
            ).data.isOnboarded
        ).toBe(false);

        const leadership = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/specialties",
            headers: user.headers,
            payload: { specialties: [Specialty.CreativeDirector] }
        });
        expect(leadership.statusCode).toBe(400);

        const chosen = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/specialties",
            headers: user.headers,
            payload: { specialties: [Specialty.Animator] }
        });
        expect(chosen.statusCode).toBe(200);
        const body = json<{ data: { specialties: string[]; isOnboarded: boolean } }>(chosen).data;
        expect(body.specialties).toEqual([Specialty.Producer, Specialty.Animator]);
        expect(body.isOnboarded).toBe(true);
    });

    it("never grants the super admin role through the api", async () => {
        const superAdmin = await context.createUser(Role.SuperAdmin);
        const admin = await context.createUser(Role.Admin);
        const target = await context.createUser(Role.Voter);

        for (const actor of [superAdmin, admin]) {
            const response = await context.application.inject({
                method: "PATCH",
                url: `/api/v1/users/${target.record.id}/role`,
                headers: actor.headers,
                payload: { role: Role.SuperAdmin }
            });
            expect(response.statusCode).toBe(403);
        }

        const demoteAdmin = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${admin.record.id}/role`,
            headers: superAdmin.headers,
            payload: { role: Role.Supervisor }
        });
        expect(demoteAdmin.statusCode).toBe(200);
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

    it("fetches users by discord id and returns 404 if missing", async () => {
        const user = await context.createUser(Role.Contributor, { specialties: [Specialty.Animator] });
        const headers = { authorization: `Bearer ${serviceToken}` };

        const response = await context.application.inject({
            method: "GET",
            url: `/api/v1/users/by-discord/${user.record.discordId}`,
            headers
        });
        expect(response.statusCode).toBe(200);
        expect(json<{ data: { id: string; role: string; specialties: string[] } }>(response).data).toMatchObject({
            id: user.record.id,
            role: Role.Contributor,
            specialties: [Specialty.Animator]
        });

        const missing = await context.application.inject({
            method: "GET",
            url: `/api/v1/users/by-discord/${nextSnowflake()}`,
            headers
        });
        expect(missing.statusCode).toBe(404);
    });

    it("emits UserRoleChanged notification when role or specialties change", async () => {
        const admin = await context.createUser(Role.Admin);
        const target = await context.createUser(Role.Voter);
        context.notifier.notifications.length = 0;

        const response = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${target.record.id}/role`,
            headers: admin.headers,
            payload: { role: Role.Contributor, specialties: [Specialty.Animator] }
        });
        expect(response.statusCode).toBe(200);

        const emitted = context.notifier.notifications.find((n) => n.type === NotificationType.UserRoleChanged);
        expect(emitted).toBeDefined();
        expect(emitted).toMatchObject({
            type: NotificationType.UserRoleChanged,
            user: { discordId: target.record.discordId, username: target.record.discordUsername },
            role: Role.Contributor,
            specialties: [Specialty.Animator]
        });
    });

    it("allows admins to manage secondary roles for themselves and peer admins while preventing primary role self-mutation", async () => {
        const admin1 = await context.createUser(Role.Admin, { specialties: [Specialty.Producer] });
        const admin2 = await context.createUser(Role.Admin);
        const supervisor1 = await context.createUser(Role.Supervisor);
        const supervisor2 = await context.createUser(Role.Supervisor);
        const contributor = await context.createUser(Role.Contributor);

        // admin updating their own secondary role
        const selfSpecialty = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${admin1.record.id}/role`,
            headers: admin1.headers,
            payload: { role: Role.Admin, specialties: [Specialty.CreativeDirector] }
        });
        expect(selfSpecialty.statusCode).toBe(200);
        expect(json<{ data: { specialties: string[] } }>(selfSpecialty).data.specialties).toEqual([Specialty.CreativeDirector]);

        // admin cannot modify their own primary role
        const selfPrimary = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${admin1.record.id}/role`,
            headers: admin1.headers,
            payload: { role: Role.Contributor }
        });
        expect(selfPrimary.statusCode).toBe(403);

        // admin updating peer admin's secondary role
        const peerSpecialty = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${admin2.record.id}/role`,
            headers: admin1.headers,
            payload: { role: Role.Admin, specialties: [Specialty.ProductionManager] }
        });
        expect(peerSpecialty.statusCode).toBe(200);
        expect(json<{ data: { specialties: string[] } }>(peerSpecialty).data.specialties).toEqual([Specialty.ProductionManager]);

        // admin cannot modify peer admin's primary role
        const peerPrimary = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${admin2.record.id}/role`,
            headers: admin1.headers,
            payload: { role: Role.Contributor }
        });
        expect(peerPrimary.statusCode).toBe(403);

        // supervisor cannot change own secondary role
        const supervisorSelf = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${supervisor1.record.id}/role`,
            headers: supervisor1.headers,
            payload: { role: Role.Supervisor, specialties: [Specialty.Producer] }
        });
        expect(supervisorSelf.statusCode).toBe(403);

        // supervisor cannot change peer supervisor's secondary role
        const supervisorPeer = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${supervisor2.record.id}/role`,
            headers: supervisor1.headers,
            payload: { role: Role.Supervisor, specialties: [Specialty.Producer] }
        });
        expect(supervisorPeer.statusCode).toBe(403);

        // supervisor can change subordinate's secondary role
        const supervisorSubordinate = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${contributor.record.id}/role`,
            headers: supervisor1.headers,
            payload: { role: Role.Contributor, specialties: [Specialty.LightingArtist] }
        });
        expect(supervisorSubordinate.statusCode).toBe(200);
        expect(json<{ data: { specialties: string[] } }>(supervisorSubordinate).data.specialties).toEqual([Specialty.LightingArtist]);
    });

    it("enforces 1-person exclusivity on supervisor/admin roles and supports atomic transfer", async () => {
        const admin = await context.createUser(Role.Admin);
        const supervisorA = await context.createUser(Role.Supervisor, { specialties: [Specialty.EditorialSupervisor] });
        const supervisorB = await context.createUser(Role.Supervisor);
        const member1 = await context.createUser(Role.Contributor);
        const member2 = await context.createUser(Role.Contributor);

        // specialty-holders lists current holder
        const holders = await context.application.inject({
            method: "GET",
            url: "/api/v1/users/specialty-holders",
            headers: admin.headers
        });
        expect(holders.statusCode).toBe(200);
        const holdersData = json<{ data: Record<string, { id: string; username: string } | null> }>(holders).data;
        expect(holdersData[Specialty.EditorialSupervisor]?.id).toBe(supervisorA.record.id);

        // assigning occupied supervisor role without transfer throws 409
        const conflict = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${supervisorB.record.id}/role`,
            headers: admin.headers,
            payload: { role: Role.Supervisor, specialties: [Specialty.EditorialSupervisor] }
        });
        expect(conflict.statusCode).toBe(409);

        // assigning with transfer: true reassigns role from A to B
        context.notifier.notifications.length = 0;
        const transferred = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${supervisorB.record.id}/role`,
            headers: admin.headers,
            payload: { role: Role.Supervisor, specialties: [Specialty.EditorialSupervisor], transfer: true }
        });
        expect(transferred.statusCode).toBe(200);
        expect(json<{ data: { specialties: string[] } }>(transferred).data.specialties).toEqual([Specialty.EditorialSupervisor]);

        // verify previous holder A lost the specialty
        const previous = await context.application.inject({
            method: "GET",
            url: `/api/v1/users/by-discord/${supervisorA.record.discordId}`,
            headers: admin.headers
        });
        expect(json<{ data: { specialties: string[] } }>(previous).data.specialties).toEqual([]);

        // multiple users can hold team specialties like media_team
        const team1 = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${member1.record.id}/role`,
            headers: admin.headers,
            payload: { role: Role.Contributor, specialties: [Specialty.MediaTeam] }
        });
        expect(team1.statusCode).toBe(200);

        const team2 = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${member2.record.id}/role`,
            headers: admin.headers,
            payload: { role: Role.Contributor, specialties: [Specialty.MediaTeam] }
        });
        expect(team2.statusCode).toBe(200);
    });
});
