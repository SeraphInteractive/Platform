import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../../src/Domain/Roles.js";
import { StorageBucket } from "../../src/Infrastructure/Storage/ObjectStorage.js";
import { createTestContext, type TestContext, type TestUser } from "../Support/TestApplication.js";

describe("UploadStreamSecurity defect reproducer (B1)", () => {
    let context: TestContext;
    let member: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        member = await context.createUser(Role.Member);
    });

    afterAll(async () => {
        await context.close();
    });

    it("rejects deliverable uploads from users who do not hold an active claim on the shot", async () => {
        const payload = Buffer.from("BLENDER_TEST_DATA");
        const key = "Project Stairway/Submission Reviews/Pending/SHOT-UNCLAIMED/submission.blend";

        // non-claimants must not be permitted to push arbitrary deliverable assets to pending vaults
        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/uploads/stream?key=${encodeURIComponent(key)}`,
            headers: {
                ...member.headers,
                "content-type": "application/octet-stream"
            },
            payload
        });

        // against current code, this returns 200 and stores the deliverable without checking claim ownership
        expect(response.statusCode).toBe(403);
    });

    it("rejects path traversal attempting to overwrite supervisor-affirmed deliverables", async () => {
        // craft mp4 header matching isIsoBmff signature
        const mp4Header = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(16)]);

        const traversalKey = "Project Stairway/Submission Reviews/Pending/SC01/../../Affirmed/SC01/final_approved.mp4";

        // path traversal must be rejected to prevent escaping pending review into affirmed deliverables
        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/uploads/stream?key=${encodeURIComponent(traversalKey)}`,
            headers: {
                ...member.headers,
                "content-type": "video/mp4"
            },
            payload: mp4Header
        });

        // current code evaluates key.startsWith(deliverableVaultPendingPrefix) as true and returns 200
        expect(response.statusCode).toBe(403);
    });

    it("prevents unverified users from placing files directly into the affirmed vault via stream", async () => {
        const payload = Buffer.from("BLENDER_TEST_DATA");
        const affirmedKey = "Project Stairway/Submission Reviews/Pending/../Affirmed/SC01/exploit.blend";

        const response = await context.application.inject({
            method: "POST",
            url: `/api/v1/uploads/stream?key=${encodeURIComponent(affirmedKey)}`,
            headers: {
                ...member.headers,
                "content-type": "application/octet-stream"
            },
            payload
        });

        // should reject unauthorized storage mutation
        expect(response.statusCode).toBe(403);
        const stored = await context.storage.getObject(StorageBucket.Deliverables, affirmedKey);
        expect(stored?.length ?? 0).toBe(0);
    });
});
