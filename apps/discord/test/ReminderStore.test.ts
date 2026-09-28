import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReminderStore } from "../src/State/ReminderStore.js";

describe("ReminderStore", () => {
    let dir: string;
    let store: ReminderStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "reminder-test-"));
        store = new ReminderStore(dir);
        await store.load();
    });

    afterEach(async () => {
        await store.flush();
        rmSync(dir, { recursive: true, force: true });
    });

    it("starts empty", () => {
        expect(store.forUser("u1")).toEqual([]);
        expect(store.size).toBe(0);
    });

    it("adds and retrieves reminders", () => {
        const r = store.add("u1", "test reminder", new Date("2025-12-01T00:00:00Z"));
        expect(r.userId).toBe("u1");
        expect(r.message).toBe("test reminder");
        expect(store.forUser("u1")).toHaveLength(1);
    });

    it("scopes reminders to users", () => {
        store.add("u1", "for u1", new Date("2025-12-01T00:00:00Z"));
        store.add("u2", "for u2", new Date("2025-12-01T00:00:00Z"));
        expect(store.forUser("u1")).toHaveLength(1);
        expect(store.forUser("u2")).toHaveLength(1);
    });

    it("enforces 10-reminder cap per user", () => {
        for (let i = 0; i < 10; i++) {
            store.add("u1", `reminder ${i}`, new Date(Date.now() + (i + 1) * 60_000));
        }
        expect(() => store.add("u1", "one too many", new Date(Date.now() + 999_999))).toThrow("10 active reminders");
    });

    it("cap is per-user, not global", () => {
        for (let i = 0; i < 10; i++) {
            store.add("u1", `reminder ${i}`, new Date(Date.now() + (i + 1) * 60_000));
        }
        // u2 should still be fine
        expect(() => store.add("u2", "u2 reminder", new Date(Date.now() + 60_000))).not.toThrow();
    });

    it("removes by id scoped to user", () => {
        const r = store.add("u1", "to cancel", new Date("2025-12-01T00:00:00Z"));
        // different user can't remove it
        expect(store.remove(r.id, "u2")).toBe(false);
        expect(store.forUser("u1")).toHaveLength(1);
        // owner can
        expect(store.remove(r.id, "u1")).toBe(true);
        expect(store.forUser("u1")).toHaveLength(0);
    });

    it("drains expired reminders", () => {
        const past = new Date(Date.now() - 60_000);
        const future = new Date(Date.now() + 3_600_000);
        store.add("u1", "expired", past);
        store.add("u1", "still active", future);

        const fired = store.drain();
        expect(fired).toHaveLength(1);
        expect(fired[0]!.message).toBe("expired");
        expect(store.forUser("u1")).toHaveLength(1);
        expect(store.forUser("u1")[0]!.message).toBe("still active");
    });

    it("returns next fire time", () => {
        const t1 = new Date("2025-12-01T00:00:00Z");
        const t2 = new Date("2025-11-01T00:00:00Z");
        store.add("u1", "later", t1);
        store.add("u1", "earlier", t2);
        expect(store.nextFireAt()?.getTime()).toBe(t2.getTime());
    });

    it("returns null nextFireAt when empty", () => {
        expect(store.nextFireAt()).toBeNull();
    });

    it("persists across loads", async () => {
        store.add("u1", "persistent", new Date("2025-12-01T00:00:00Z"));
        // small delay to let async write settle
        await new Promise((r) => setTimeout(r, 100));

        const store2 = new ReminderStore(dir);
        await store2.load();
        expect(store2.forUser("u1")).toHaveLength(1);
        expect(store2.forUser("u1")[0]!.message).toBe("persistent");
    });

    it("sorts by fire time", () => {
        store.add("u1", "third", new Date("2025-12-03T00:00:00Z"));
        store.add("u1", "first", new Date("2025-12-01T00:00:00Z"));
        store.add("u1", "second", new Date("2025-12-02T00:00:00Z"));
        const list = store.forUser("u1");
        expect(list.map((r) => r.message)).toEqual(["first", "second", "third"]);
    });
});
