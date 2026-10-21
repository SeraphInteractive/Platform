import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReminderScheduler } from "../../src/Services/ReminderScheduler.js";
import { ReminderStore } from "../../src/State/ReminderStore.js";

// b7: 32-bit integer overflow in reminderscheduler for delays exceeding 24.8 days
describe("b7: ReminderScheduler 32-bit timer overflow", () => {
    let dir = "";
    let store: ReminderStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "reminder-overflow-"));
        store = new ReminderStore(dir);
        await store.load();
    });

    afterEach(async () => {
        await store.flush();
        await rm(dir, { recursive: true, force: true });
    });

    it("schedules timers within node 32-bit signed int limit for long-delay reminders", () => {
        vi.useFakeTimers();

        // schedule a reminder 30 days in the future (within 90-day timeparser limit)
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const fireAt = new Date(Date.now() + thirtyDaysMs);
        store.add("user-1", "review quarterly deliverables", fireAt);

        const mockClient = {
            users: {
                fetch: vi.fn()
            }
        };
        const mockLogger = {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        const scheduler = new ReminderScheduler(mockClient as never, store, mockLogger as never);
        const setTimeoutSpy = vi.spyOn(global, "setTimeout");

        try {
            scheduler.start();

            expect(setTimeoutSpy).toHaveBeenCalled();
            const delayPassed = setTimeoutSpy.mock.calls[0]?.[1];

            // node clamps setTimeout delays > 2147483647 to 1ms, causing a tight infinite loop
            // delay passed to setTimeout must be capped at max 32-bit signed integer (2147483647 ms)
            expect(delayPassed).toBeDefined();
            expect(delayPassed).toBeLessThanOrEqual(2_147_483_647);
        } finally {
            scheduler.stop();
            vi.useRealTimers();
            setTimeoutSpy.mockRestore();
        }
    });

    it("does not enter 1ms busy loop when reminder is due far in the future", () => {
        vi.useFakeTimers();

        const fortyDaysMs = 40 * 24 * 60 * 60 * 1000;
        const fireAt = new Date(Date.now() + fortyDaysMs);
        store.add("user-1", "long term deadline", fireAt);

        const mockClient = {
            users: {
                fetch: vi.fn().mockResolvedValue({ send: vi.fn() })
            }
        };
        const mockLogger = {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        const scheduler = new ReminderScheduler(mockClient as never, store, mockLogger as never);
        const setTimeoutSpy = vi.spyOn(global, "setTimeout");

        try {
            scheduler.start();

            // advance 100ms: if node clamped overflowed delay to 1ms, fire() would repeatedly execute
            vi.advanceTimersByTime(100);

            // users.fetch should not be called because reminder is not due for 40 days
            expect(mockClient.users.fetch).not.toHaveBeenCalled();

            // scheduler should not have triggered rapid successive setTimeout calls within 100ms
            expect(setTimeoutSpy.mock.calls.length).toBeLessThanOrEqual(1);
        } finally {
            scheduler.stop();
            vi.useRealTimers();
            setTimeoutSpy.mockRestore();
        }
    });
});
