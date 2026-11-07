import type { ScreenplayDto, ScreenplayShelfDto, ScreenplayVersionDto } from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("scripts", () => {
    let context: TestContext;
    let admin: TestUser;
    let contributor: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        contributor = await context.createUser(Role.Contributor);
    });

    afterAll(async () => {
        await context.close();
    });

    const createScript = (user: TestUser, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "POST", url: "/api/v1/scripts", headers: user.headers, payload });

    const getScript = (user: TestUser, id: string): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "GET", url: `/api/v1/scripts/${id}`, headers: user.headers });

    const updateScript = (user: TestUser, id: string, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "PATCH", url: `/api/v1/scripts/${id}`, headers: user.headers, payload });

    const createVersion = (user: TestUser, scriptId: string, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "POST",
            url: `/api/v1/scripts/${scriptId}/versions`,
            headers: user.headers,
            payload
        });

    const listVersions = (user: TestUser, scriptId: string): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "GET",
            url: `/api/v1/scripts/${scriptId}/versions`,
            headers: user.headers
        });

    const restoreVersion = (user: TestUser, scriptId: string, versionId: string): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "POST",
            url: `/api/v1/scripts/${scriptId}/versions/${versionId}/restore`,
            headers: user.headers
        });

    it("restricts script creation strictly to administrators", async () => {
        const forbidden = await createScript(contributor, { title: "Hacker Script" });
        expect(forbidden.statusCode).toBe(403);

        const allowed = await createScript(admin, { title: "Pilot Episode" });
        expect(allowed.statusCode).toBe(201);
        const data = json<{ data: ScreenplayDto }>(allowed).data;
        expect(data.title).toBe("Pilot Episode");
        expect(data.ownerId).toBe(admin.record.id);
        expect(data.userRole).toBe("owner");
    });

    it("persists updates with debounced auto-save payload format", async () => {
        const created = await createScript(admin, { title: "Feature Film" });
        const scriptId = json<{ data: ScreenplayDto }>(created).data.id;

        const updatedDoc = {
            type: "doc",
            content: [
                {
                    type: "sceneHeading",
                    attrs: { id: "sc_1", sceneNumber: "1" },
                    content: [{ type: "text", text: "EXT. DESERT - DUSK" }]
                },
                {
                    type: "action",
                    content: [{ type: "text", text: "The wind howls across the dunes." }]
                }
            ]
        };

        const patchRes = await updateScript(admin, scriptId, {
            title: "Feature Film - Revised",
            content: updatedDoc,
            wordCount: 125,
            sceneCount: 1
        });

        expect(patchRes.statusCode).toBe(200);
        const fetched = await getScript(admin, scriptId);
        expect(fetched.statusCode).toBe(200);
        const data = json<{ data: ScreenplayDto }>(fetched).data;
        expect(data.title).toBe("Feature Film - Revised");
        expect(data.wordCount).toBe(125);
        expect(data.sceneCount).toBe(1);
    });

    it("records versions with author username and registered discord avatar", async () => {
        const created = await createScript(admin, { title: "Version Tracking Script" });
        const scriptId = json<{ data: ScreenplayDto }>(created).data.id;

        const snap1Doc = {
            type: "doc",
            content: [{ type: "action", content: [{ type: "text", text: "First pass draft." }] }]
        };

        const vRes = await createVersion(admin, scriptId, {
            name: "Act 1 Complete",
            content: snap1Doc,
            wordCount: 450,
            sceneCount: 3
        });

        expect(vRes.statusCode).toBe(201);
        const createdVersion = json<{ data: ScreenplayVersionDto }>(vRes).data;
        expect(createdVersion.name).toBe("Act 1 Complete");
        expect(createdVersion.userId).toBe(admin.record.id);
        expect(createdVersion.user?.username).toBe(admin.record.discordUsername);

        const listRes = await listVersions(admin, scriptId);
        expect(listRes.statusCode).toBe(200);
        const versions = json<{ data: ScreenplayVersionDto[] }>(listRes).data;
        // initial draft + act 1 complete
        expect(versions.length).toBeGreaterThanOrEqual(2);
        expect(versions[0]?.name).toBe("Act 1 Complete");
        expect(versions[0]?.user?.username).toBe(admin.record.discordUsername);
    });

    it("restores version snapshots and creates a safety backup", async () => {
        const created = await createScript(admin, { title: "Restore Test Script" });
        const scriptId = json<{ data: ScreenplayDto }>(created).data.id;

        const targetSnapshotDoc = {
            type: "doc",
            content: [{ type: "action", content: [{ type: "text", text: "Original snapshot text." }] }]
        };

        const vRes = await createVersion(admin, scriptId, {
            name: "Golden Snapshot",
            content: targetSnapshotDoc,
            wordCount: 100,
            sceneCount: 1
        });
        const targetVersionId = json<{ data: ScreenplayVersionDto }>(vRes).data.id;

        // mutate current document
        await updateScript(admin, scriptId, {
            content: {
                type: "doc",
                content: [{ type: "action", content: [{ type: "text", text: "Messy work in progress." }] }]
            },
            wordCount: 200,
            sceneCount: 2
        });

        // restore Golden Snapshot
        const restoreRes = await restoreVersion(admin, scriptId, targetVersionId);
        expect(restoreRes.statusCode).toBe(200);
        const restored = json<{ data: ScreenplayDto }>(restoreRes).data;
        expect(restored.wordCount).toBe(100);
        expect(restored.content).toEqual(targetSnapshotDoc);

        // verify safety backup version was automatically generated
        const versionsList = await listVersions(admin, scriptId);
        const versions = json<{ data: ScreenplayVersionDto[] }>(versionsList).data;
        expect(versions.some((v) => v.name.includes("Before restore to"))).toBe(true);
    });

    it("supports collaborator management and permissions", async () => {
        const created = await createScript(admin, { title: "Team Screenplay" });
        const scriptId = json<{ data: ScreenplayDto }>(created).data.id;

        // contributor cannot access yet
        const initialGet = await getScript(contributor, scriptId);
        expect(initialGet.statusCode).toBe(403);

        // invite contributor as editor
        const addCollabRes = await context.application.inject({
            method: "POST",
            url: `/api/v1/scripts/${scriptId}/collaborators`,
            headers: admin.headers,
            payload: { userId: contributor.record.id, role: "editor" }
        });
        expect(addCollabRes.statusCode).toBe(200);

        // contributor can now view and edit
        const collabGet = await getScript(contributor, scriptId);
        expect(collabGet.statusCode).toBe(200);
        expect(json<{ data: ScreenplayDto }>(collabGet).data.userRole).toBe("editor");

        const collabEdit = await updateScript(contributor, scriptId, {
            title: "Team Screenplay - Edited by Contributor"
        });
        expect(collabEdit.statusCode).toBe(200);

        // contributor can save version snapshot
        const collabVersion = await createVersion(contributor, scriptId, {
            name: "Contributor Polish",
            content: { type: "doc", content: [] },
            wordCount: 300,
            sceneCount: 2
        });
        expect(collabVersion.statusCode).toBe(201);
        expect(json<{ data: ScreenplayVersionDto }>(collabVersion).data.user?.username).toBe(contributor.record.discordUsername);

        const removeRes = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/scripts/${scriptId}/collaborators/${contributor.record.id}`,
            headers: admin.headers
        });
        expect(removeRes.statusCode).toBe(204);

        const revokedGet = await getScript(contributor, scriptId);
        expect(revokedGet.statusCode).toBe(403);

        // add collaborator using platform service token
        const serviceAddRes = await context.application.inject({
            method: "POST",
            url: `/api/v1/scripts/${scriptId}/collaborators`,
            headers: { authorization: `Bearer ${serviceToken}` },
            payload: { userId: contributor.record.id, role: "viewer" }
        });
        expect(serviceAddRes.statusCode).toBe(200);

        const viewerGet = await getScript(contributor, scriptId);
        expect(viewerGet.statusCode).toBe(200);
        expect(json<{ data: ScreenplayDto }>(viewerGet).data.userRole).toBe("viewer");

        // remove collaborator using platform service token
        const serviceRemoveRes = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/scripts/${scriptId}/collaborators/${contributor.record.id}`,
            headers: { authorization: `Bearer ${serviceToken}` }
        });
        expect(serviceRemoveRes.statusCode).toBe(204);

        const secondRevokedGet = await getScript(contributor, scriptId);
        expect(secondRevokedGet.statusCode).toBe(403);
    });

    it("handles shelf creation, listing, and deletion", async () => {
        const createRes = await context.application.inject({
            method: "POST",
            url: "/api/v1/scripts/shelves",
            headers: admin.headers,
            payload: { name: "Feature Films" }
        });
        expect(createRes.statusCode).toBe(201);
        const shelf = json<{ data: ScreenplayShelfDto }>(createRes).data;
        expect(shelf.name).toBe("Feature Films");

        const listRes = await context.application.inject({
            method: "GET",
            url: "/api/v1/scripts/shelves",
            headers: admin.headers
        });
        expect(listRes.statusCode).toBe(200);
        const shelves = json<{ data: ScreenplayShelfDto[] }>(listRes).data;
        expect(shelves.some((s) => s.id === shelf.id)).toBe(true);

        const deleteRes = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/scripts/shelves/${shelf.id}`,
            headers: admin.headers
        });
        expect(deleteRes.statusCode).toBe(204);
    });
});
