import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationType } from "@platform/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationConsumer } from "../../src/Api/NotificationConsumer.js";
import { SettingsStore } from "../../src/State/SettingsStore.js";

// b14: notification loss on handler error due to premature cursor advancement
describe("b14: NotificationConsumer cursor loss on transient failure", () => {
    let dir = "";
    let settings: SettingsStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "notification-cursor-"));
        settings = new SettingsStore(dir);
        await settings.load();
    });

    afterEach(async () => {
        await settings.flush();
        await rm(dir, { recursive: true, force: true });
    });

    it("must not advance notificationCursor when the notification handler throws an error", async () => {
        const initialCursor = "100-0";
        await settings.update((s) => {
            s.notificationCursor = initialCursor;
        });

        // handler throws due to transient downstream error (e.g. discord gateway hiccup or rate limit)
        const failingHandler = vi.fn().mockRejectedValue(new Error("Discord API 500: Temporary Internal Error"));

        const mockApi = {
            send: vi.fn()
        };

        const mockLogger = {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        const consumer = new NotificationConsumer(mockApi as never, settings, failingHandler, mockLogger as never);

        const validNotification = {
            type: NotificationType.ShotCreated,
            occurredAt: "2026-09-27T01:08:00.000Z",
            shot: {
                id: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b5c",
                code: "SC01_A1B2",
                title: "Opening pan",
                sceneNumber: 1,
                difficulty: "hard"
            }
        };

        const failedEvent = {
            id: "101-0",
            event: "notification",
            data: JSON.stringify(validNotification)
        };

        // dispatch the event through the consumer
        await (consumer as unknown as { dispatch: (e: unknown) => Promise<void> }).dispatch(failedEvent);

        expect(failingHandler).toHaveBeenCalled();

        // when the handler fails, notificationCursor must not advance to the failed event id
        // advancing the cursor causes the notification to be permanently dropped on reconnection
        expect(settings.notificationCursor).toBe(initialCursor);
    });
});
