import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DifficultyTier, ShotStatus } from "../src/Domain/Enums.js";
import { Role } from "../src/Domain/Roles.js";
import { shots, users } from "../src/Infrastructure/Database/Schema.js";
import { NotificationType } from "../src/Infrastructure/Notifications/Notification.js";
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
        const voter = await context.createUser(Role.Voter);

        // users without contributor role can claim tasks
        const claim = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/claim`,
            headers: voter.headers
        });
        expect(claim.statusCode).toBe(200);
        expect(json<Envelope<{ status: string; deadlineAt: string }>>(claim).data.status).toBe(ShotStatus.Claimed);

        const otherShot = await createShot("SC01-020");
        const second = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${otherShot}/claim`,
            headers: voter.headers
        });
        expect(json(second).code).toBe("ACTIVE_CLAIM_EXISTS");

        const badExtension = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/uploads`,
            headers: voter.headers,
            payload: { kind: "video", fileName: "../../evil.sh", contentType: "video/mp4", sizeBytes: 100 }
        });
        expect(badExtension.statusCode).toBe(422);

        const upload = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/uploads`,
            headers: voter.headers,
            payload: { kind: "video", fileName: "../../final cut.mp4", contentType: "video/mp4", sizeBytes: 1024 }
        });
        expect(upload.statusCode).toBe(201);
        const { key } = json<Envelope<{ key: string }>>(upload).data;
        expect(key).toMatch(new RegExp(`^shots/${shotId}/${voter.record.id}/[0-9a-f-]{36}-final_cut\\.mp4$`, "u"));

        const blendUpload = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/uploads`,
            headers: voter.headers,
            payload: { kind: "blend", fileName: "project.blend", contentType: "application/octet-stream", sizeBytes: 2048 }
        });
        expect(blendUpload.statusCode).toBe(201);
        const blendKey = json<Envelope<{ key: string }>>(blendUpload).data.key;

        const missing = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: voter.headers,
            payload: { videoKey: key, blendKey }
        });
        expect(json(missing).code).toBe("UPLOAD_MISSING");

        context.storage.store(StorageBucket.Deliverables, key, 1024, "video/mp4");
        context.storage.store(StorageBucket.Deliverables, blendKey, 2048, "application/octet-stream");
        const submitted = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: voter.headers,
            payload: { videoKey: key, blendKey, notes: "v1" }
        });
        expect(submitted.statusCode).toBe(201);
        const submission = json<Envelope<{ id: string; version: number; videoUrl: string | null }>>(submitted).data;
        expect(submission.version).toBe(1);
        expect(submission.videoUrl).not.toBeNull();

        // submitting work promotes voter to contributor
        const [updatedUser] = await context.database.select().from(users).where(eq(users.id, voter.record.id));
        expect(updatedUser?.role).toBe(Role.Contributor);

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
        const blendUpload = json<Envelope<{ key: string }>>(
            await context.application.inject({
                method: "POST",
                url: `/api/v1/shots/${shotId}/uploads`,
                headers: worker.headers,
                payload: { kind: "blend", fileName: "a.blend", contentType: "application/octet-stream", sizeBytes: 10 }
            })
        ).data;
        context.storage.store(StorageBucket.Deliverables, upload.key, 10, "video/mp4");
        context.storage.store(StorageBucket.Deliverables, blendUpload.key, 10, "application/octet-stream");
        const submission = json<Envelope<{ id: string }>>(
            await context.application.inject({
                method: "POST",
                url: `/api/v1/shots/${shotId}/submissions`,
                headers: worker.headers,
                payload: { videoKey: upload.key, blendKey: blendUpload.key }
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

    it("attaches and resolves up to 4 reference images", async () => {
        const key1 = "media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png";
        const key2 = "media/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.jpg";

        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: {
                sceneNumber: 2,
                shotCode: "SC06-010",
                title: "Ref test",
                difficultyTier: DifficultyTier.Easy,
                imageKeys: [key1, key2]
            }
        });
        expect(response.statusCode).toBe(201);
        const created = json<Envelope<{ id: string; imageUrls: string[] }>>(response).data;
        expect(created.imageUrls).toHaveLength(2);
        expect(created.imageUrls[0]).toContain(key1);
        expect(created.imageUrls[1]).toContain(key2);

        // reject more than 4 images
        const tooMany = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: {
                sceneNumber: 2,
                shotCode: "SC06-020",
                title: "Too many images",
                difficultyTier: DifficultyTier.Easy,
                imageKeys: ["key1", "key2", "key3", "key4", "key5"]
            }
        });
        expect(tooMany.statusCode).toBe(400);

        // update images
        const updated = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/shots/${created.id}`,
            headers: supervisor.headers,
            payload: {
                imageKeys: [key1]
            }
        });
        expect(updated.statusCode).toBe(200);
        expect(json<Envelope<{ imageUrls: string[] }>>(updated).data.imageUrls).toHaveLength(1);
    });

    it("scans task deliverables for AI video signatures and notifies supervisors", async () => {
        const shotId = await createShot("SC07-010");
        const worker = await context.createUser(Role.Contributor);

        await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/claim`,
            headers: worker.headers
        });

        // create synthetic MP4 with Runway Gen-3 metadata in moov atom
        const moovPayload = Buffer.from("Rendered with Runway Gen-3 Alpha model", "utf-8");
        const atomLen = Buffer.alloc(4);
        atomLen.writeUInt32BE(moovPayload.length + 8, 0);
        const ftyp = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x14]), Buffer.from("ftypisom", "ascii"), Buffer.alloc(8)]);
        const mp4Buf = Buffer.concat([ftyp, atomLen, Buffer.from("moov", "ascii"), moovPayload]);

        const videoKey = `shots/${shotId}/${worker.record.id}/11111111-2222-3333-4444-555555555555-video_ai.mp4`;
        const blendKey = `shots/${shotId}/${worker.record.id}/11111111-2222-3333-4444-555555555555-project.blend`;
        context.storage.store(StorageBucket.Deliverables, videoKey, mp4Buf.length, "video/mp4", mp4Buf);
        context.storage.store(StorageBucket.Deliverables, blendKey, 100, "application/octet-stream");

        const submitted = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: worker.headers,
            payload: { videoKey, blendKey, notes: "AI generated test shot" }
        });
        expect(submitted.statusCode).toBe(201);
        const submission = json<Envelope<{ id: string; aiFlags: string[] }>>(submitted).data;
        expect(submission.aiFlags).toContain("Runway AI video signature");

        // verify telemetry alert notification
        const aiNotif = context.notifier.notifications.find(
            (n) => n.type === NotificationType.MediaFlaggedAi && n.targetId === submission.id
        );
        expect(aiNotif).toBeDefined();
        if (aiNotif && aiNotif.type === NotificationType.MediaFlaggedAi) {
            expect(aiNotif.mediaKind).toBe("task_submission");
            expect(aiNotif.flags).toContain("Runway AI video signature");
        }
    });

    it("prevents blacklisted users from claiming or submitting tasks", async () => {
        const shotId = await createShot("SC08-010");
        const worker = await context.createUser(Role.Contributor);
        await context.database.update(users).set({ isBlacklisted: true }).where(eq(users.id, worker.record.id));

        const claimAttempt = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/claim`,
            headers: worker.headers
        });
        expect(claimAttempt.statusCode).toBe(403);
        expect(json(claimAttempt).code).toBe("USER_BLACKLISTED");

        const submitAttempt = await context.application.inject({
            method: "POST",
            url: `/api/v1/shots/${shotId}/submissions`,
            headers: worker.headers,
            payload: { videoKey: "dummy-video", blendKey: "dummy-blend", notes: null }
        });
        expect(submitAttempt.statusCode).toBe(403);
        expect(json(submitAttempt).code).toBe("USER_BLACKLISTED");
    });
});
