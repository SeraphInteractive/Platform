import { describe, expect, it } from "vitest";
import { StorageBucket } from "../src/Infrastructure/Storage/ObjectStorage.js";
import { NextcloudWebDAVStorage } from "../src/Infrastructure/Storage/NextcloudWebDAVStorage.js";
import { HybridObjectStorage } from "../src/Infrastructure/Storage/HybridObjectStorage.js";
import { FakeObjectStorage } from "./Support/TestDoubles.js";

const testVpsUrl = "http://127.0.0.1:18080";
const testVpsUsername = "stairway_test";
const testVpsPassword = "stairway_test_password_123";

async function isTestVpsAvailable(): Promise<boolean> {
    try {
        const res = await fetch(`${testVpsUrl}/status.php`, { signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        return false;
    }
}

describe("NextcloudWebDAVStorage", () => {
    it("reports enabled status only for Deliverables bucket", () => {
        const storage = new NextcloudWebDAVStorage({
            url: testVpsUrl,
            username: testVpsUsername,
            password: testVpsPassword
        });

        expect(storage.isEnabled(StorageBucket.Deliverables)).toBe(true);
        expect(storage.isEnabled(StorageBucket.Media)).toBe(false);

        const disabled = new NextcloudWebDAVStorage({});
        expect(disabled.isEnabled(StorageBucket.Deliverables)).toBe(false);
    });

    it("generates direct upload targets with authorization headers", async () => {
        const storage = new NextcloudWebDAVStorage({
            url: testVpsUrl,
            username: testVpsUsername,
            password: testVpsPassword,
            publicUrl: "https://vault.projectstairway.net"
        });

        // skip network call when test container is offline
        const hasVps = await isTestVpsAvailable();
        if (hasVps) {
            const upload = await storage.createUpload(
                StorageBucket.Deliverables,
                "submissions/pending-review/task-unit-test/sample.blend",
                "application/x-blender",
                1024
            );

            expect(upload.method).toBe("PUT");
            expect(upload.url).toContain(
                "https://vault.projectstairway.net/remote.php/dav/files/stairway_test/submissions/pending-review/task-unit-test/sample.blend"
            );
            expect(upload.headers.Authorization).toMatch(/^Basic /u);
            expect(upload.headers["Content-Type"]).toBe("application/x-blender");
            expect(upload.headers["Content-Length"]).toBe("1024");
        }
    });

    it("generates vault folder URLs for Nextcloud web interface", () => {
        const storage = new NextcloudWebDAVStorage({
            url: testVpsUrl,
            username: testVpsUsername,
            password: testVpsPassword,
            publicUrl: "https://vault.projectstairway.net"
        });

        const url = storage.getVaultFolderUrl(StorageBucket.Deliverables, "Pending/shots/shot-1/user-1");
        expect(url).toBe("https://vault.projectstairway.net/apps/files/folders?dir=/Pending/shots/shot-1/user-1");

        expect(storage.getVaultFolderUrl(StorageBucket.Media, "Pending/shots")).toBeNull();
    });

    it("performs live upload, metadata retrieval, move, download, and delete against test VPS", async () => {
        const hasVps = await isTestVpsAvailable();
        if (!hasVps) {
            // skip live checks when container is stopped
            return;
        }

        const storage = new NextcloudWebDAVStorage({
            url: testVpsUrl,
            username: testVpsUsername,
            password: testVpsPassword
        });

        const testKey = `submissions/pending-review/task-int-${Date.now()}/model.blend`;
        const testData = Buffer.from("NEXTCLOUD-WEBDAV-BLENDER-DATA-STREAM");

        await storage.putObject(StorageBucket.Deliverables, testKey, testData, "application/x-blender");

        const metadata = await storage.getMetadata(StorageBucket.Deliverables, testKey);
        expect(metadata).not.toBeNull();
        expect(metadata?.sizeBytes).toBe(testData.length);

        const promotedKey = `production/animation/task-int-${Date.now()}/model.blend`;
        await storage.moveObject(StorageBucket.Deliverables, testKey, promotedKey);

        const oldMetadata = await storage.getMetadata(StorageBucket.Deliverables, testKey);
        expect(oldMetadata).toBeNull();

        const downloaded = await storage.getObject(StorageBucket.Deliverables, promotedKey);
        expect(downloaded).not.toBeNull();
        expect(downloaded?.toString("utf-8")).toBe("NEXTCLOUD-WEBDAV-BLENDER-DATA-STREAM");

        await storage.deleteObject(StorageBucket.Deliverables, promotedKey);
        const deletedMetadata = await storage.getMetadata(StorageBucket.Deliverables, promotedKey);
        expect(deletedMetadata).toBeNull();

        const usage = await storage.getStorageUsage();
        expect(usage).not.toBeNull();
        expect(usage?.usedBytes).toBeGreaterThanOrEqual(0);
    });
});

describe("HybridObjectStorage", () => {
    it("routes deliverables and media to respective drivers", async () => {
        const deliverablesStorage = new FakeObjectStorage();
        const mediaStorage = new FakeObjectStorage();
        const hybrid = new HybridObjectStorage(deliverablesStorage, mediaStorage);

        deliverablesStorage.store(StorageBucket.Deliverables, "pending/shot.blend", 500, "application/octet-stream");
        mediaStorage.store(StorageBucket.Media, "avatars/user.png", 200, "image/png");

        const deliverableMeta = await hybrid.getMetadata(StorageBucket.Deliverables, "pending/shot.blend");
        expect(deliverableMeta?.sizeBytes).toBe(500);

        const mediaMeta = await hybrid.getMetadata(StorageBucket.Media, "avatars/user.png");
        expect(mediaMeta?.sizeBytes).toBe(200);

        await hybrid.moveObject(StorageBucket.Deliverables, "pending/shot.blend", "production/shot.blend");
        const movedMeta = await hybrid.getMetadata(StorageBucket.Deliverables, "production/shot.blend");
        expect(movedMeta?.sizeBytes).toBe(500);
        expect(await hybrid.getMetadata(StorageBucket.Deliverables, "pending/shot.blend")).toBeNull();
    });
});
