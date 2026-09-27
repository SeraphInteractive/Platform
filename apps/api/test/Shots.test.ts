import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DifficultyTier, ShotStatus } from "../src/Domain/Enums.js";
import { Role } from "../src/Domain/Roles.js";
import { shots } from "../src/Infrastructure/Database/Schema.js";
import { StorageBucket } from "../src/Infrastructure/Storage/ObjectStorage.js";
import { createTestContext, json, nextSnowflake, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

interface Envelope<T> {
    readonly data: T;
}

describe("shot grab-box", () => {
    let context: TestContext;
    let supervisor: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);
    });

    afterAll(async () => {
        await context.close();
    });

    async function createShot(code: string, tier: DifficultyTier = DifficultyTier.Easy, seniorPriorityHours = 0): Promise<string> {
        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: { sceneNumber: 1, shotCode: code, title: code, difficultyTier: tier, seniorPriorityHours }
        });
        expect(response.statusCode).toBe(201);
        return json<Envelope<{ id: string }>>(response).data.id;
    }

    it("runs claim, upload, submit and review", async () => {
        const shotId = await createShot("SC01-010");
        const contributor = await context.createUser(Role.Contributor);
        const voter = await context.createUser(Role.Voter);

        expect(
            (await context.application.inject({ method: "POST", url: `/api/v1/shots/${shotId}/claim`, headers: voter.headers })).statusCode
        ).toBe(403);
        const claim = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/claim`,
            headers: contributor.headers
        });
        expect(claim.statusCode).toBe(200);
        expect(json<Envelope<{ status: string; deadlineAt: string }>>(claim).data.status).toBe(ShotStatus.Claimed);

        const otherShot = await createShot("SC01-020");
        const second = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${otherShot}/claim`,
            headers: contributor.headers
        });
        expect(json(second).code).toBe("ACTIVE_CLAIM_EXISTS");

        const badExtension = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/uploads`,
            headers: contributor.headers,
            payload: { kind: "video", fileName: "../../evil.sh", contentType: "video/mp4", sizeBytes: 100 }
        });
        expect(badExtension.statusCode).toBe(422);

        const upload = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/uploads`,
            headers: contributor.headers,
            payload: { kind: "video", fileName: "../../final cut.mp4", contentType: "video/mp4", sizeBytes: 1024 }
        });
        expect(upload.statusCode).toBe(201);
        const { key } = json<Envelope<{ key: string }>>(upload).data;
        expect(key).toMatch(new RegExp(`^shots/${shotId}/${contributor.record.id}/[0-9a-f-]{36}-final_cut\\.mp4$`, "u"));

        const missing = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: contributor.headers,
            payload: { videoKey: key }
        });
        expect(json(missing).code).toBe("UPLOAD_MISSING");

        context.storage.store(StorageBucket.Deliverables, key, 1024, "video/mp4");
        const submitted = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: contributor.headers,
            payload: { videoKey: key, notes: "v1" }
        });
        expect(submitted.statusCode).toBe(201);
        const submission = json<Envelope<{ id: string; version: number; videoUrl: string | null }>>(submitted).data;
        expect(submission.version).toBe(1);
        expect(submission.videoUrl).not.toBeNull();

        const publicDetail = await context.application.inject({ method: "GET", url: `/api/v1/shots/${shotId}` });
        expect(json<Envelope<{ submissions: { videoUrl: string | null }[] }>>(publicDetail).data.submissions[0]?.videoUrl).toBeNull();

        const queue = await context.application.inject({ method: "GET", url: "/api/v1/reviews", headers: supervisor.headers });
        expect(json<{ data: { id: string }[] }>(queue).data.map((item) => item.id)).toContain(submission.id);

        const revision = await context.application.inject({
            method: "POST",
            url: `/api/v1/submissions/${submission.id}/review`,
            headers: supervisor.headers,
            payload: { decision: "revision_requested", notes: "tighten timing" }
        });
        expect(revision.statusCode).toBe(200);
        const again = await context.application.inject({
            method: "POST",
            url: `/api/v1/submissions/${submission.id}/review`,
            headers: supervisor.headers,
            payload: { decision: "approved" }
        });
        expect(json(again).code).toBe("SUBMISSION_NOT_PENDING");

        const [afterRevision] = await context.database.select().from(shots).where(eq(shots.id, shotId));
        expect(afterRevision?.status).toBe(ShotStatus.Claimed);
    });

    it("prevents supervisors from reviewing their own work", async () => {
        const shotId = await createShot("SC02-010");
        const worker = await context.createUser(Role.Supervisor);
        await context.application.inject({ method: "POST", url: `/api/v1/shots/${shotId}/claim`, headers: worker.headers });
        const upload = json<Envelope<{ key: string }>>(
            await context.application.inject({
                method: "POST",
                url: `/api/v1/shots/${shotId}/uploads`,
                headers: worker.headers,
                payload: { kind: "video", fileName: "a.mp4", contentType: "video/mp4", sizeBytes: 10 }
            })
        ).data;
        context.storage.store(StorageBucket.Deliverables, upload.key, 10, "video/mp4");
        const submission = json<Envelope<{ id: string }>>(
            await context.application.inject({
                method: "POST",
                url: `/api/v1/shots/${shotId}/submissions`,
                headers: worker.headers,
                payload: { videoKey: upload.key }
            })
        ).data;
        const review = await context.application.inject({
            method: "POST",
            url: `/api/v1/submissions/${submission.id}/review`,
            headers: worker.headers,
            payload: { decision: "approved" }
        });
        expect(review.statusCode).toBe(403);
    });

    it("enforces the senior priority window", async () => {
        const shotId = await createShot("SC03-010", DifficultyTier.Complex, 24);
        const contributor = await context.createUser(Role.Contributor);
        const senior = await context.createUser(Role.SeniorContributor);
        const listed = await context.application.inject({
            method: "GET",
            url: "/api/v1/shots?difficultyTier=complex",
            headers: contributor.headers
        });
        expect(
            json<{ data: { id: string; isSeniorLocked: boolean }[] }>(listed).data.find((shot) => shot.id === shotId)?.isSeniorLocked
        ).toBe(true);
        const blocked = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/claim`,
            headers: contributor.headers
        });
        expect(json(blocked).code).toBe("SENIOR_PRIORITY_LOCK");
        const allowed = await context.application.inject({ method: "POST", url: `/api/v1/shots/${shotId}/claim`, headers: senior.headers });
        expect(allowed.statusCode).toBe(200);
    });

    it("reclaims expired claims", async () => {
        const shotId = await createShot("SC04-010");
        const contributor = await context.createUser(Role.Contributor);
        await context.application.inject({ method: "POST", url: `/api/v1/shots/${shotId}/claim`, headers: contributor.headers });
        await context.database
            .update(shots)
            .set({ deadlineAt: new Date(Date.now() - 1000) })
            .where(eq(shots.id, shotId));
        const sweep = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots/reclaim-expired",
            headers: supervisor.headers
        });
        expect(json<Envelope<{ shotCodes: string[] }>>(sweep).data.shotCodes).toContain("SC04-010");
        const [shot] = await context.database.select().from(shots).where(eq(shots.id, shotId));
        expect(shot?.status).toBe(ShotStatus.Available);
        expect(shot?.claimedBy).toBeNull();
    });

    it("requires service or staff credentials to bind Discord threads", async () => {
        const shotId = await createShot("SC05-010");
        const threadId = nextSnowflake();
        const anonymous = await context.application.inject({
            method: "PUT",
            url: `/api/v1/shot-thread-maps/${shotId}`,
            payload: { discordThreadId: threadId }
        });
        expect(anonymous.statusCode).toBe(401);
        const bound = await context.application.inject({
            method: "PUT",
            url: `/api/v1/shot-thread-maps/${shotId}`,
            headers: { authorization: `Bearer ${serviceToken}` },
            payload: { discordThreadId: threadId }
        });
        expect(bound.statusCode).toBe(200);
        const lookup = await context.application.inject({
            method: "GET",
            url: `/api/v1/shot-thread-maps/by-thread/${threadId}`,
            headers: { authorization: `Bearer ${serviceToken}` }
        });
        expect(json<Envelope<{ shotId: string }>>(lookup).data.shotId).toBe(shotId);
        const unknownShot = await context.application.inject({
            method: "PUT",
            url: "/api/v1/shot-thread-maps/00000000-0000-4000-8000-000000000000",
            headers: { authorization: `Bearer ${serviceToken}` },
            payload: { discordThreadId: nextSnowflake() }
        });
        expect(unknownShot.statusCode).toBe(404);
    });
});
