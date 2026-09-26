import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShotStatus } from "@platform/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { parseServerSentEvents } from "../src/Api/NotificationConsumer.js";
import { loadBotConfiguration } from "../src/Configuration/BotConfiguration.js";
import { ChannelPurpose, SettingsStore } from "../src/State/SettingsStore.js";

describe("server-sent event parsing", () => {
    it("splits complete events and keeps partial ones", () => {
        const { events, remainder } = parseServerSentEvents(
            'retry: 3000\n\n: keep-alive\n\nid: 5-0\nevent: notification\ndata: {"a":1}\n\nid: 6-0\nevent: noti'
        );
        expect(events).toEqual([{ id: "5-0", event: "notification", data: '{"a":1}' }]);
        expect(remainder).toBe("id: 6-0\nevent: noti");
    });

    it("handles CRLF line endings and multi-line data", () => {
        const { events } = parseServerSentEvents("id: 1-0\r\ndata: one\r\ndata: two\r\n\r\n");
        expect(events[0]).toEqual({ id: "1-0", event: "message", data: "one\ntwo" });
    });
});

describe("settings store", () => {
    let directory = "";

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("persists settings atomically and ignores corrupt values", async () => {
        directory = await mkdtemp(join(tmpdir(), "platform-discord-"));
        const store = new SettingsStore(directory);
        await store.load();
        await store.update((settings) => {
            settings.channels[ChannelPurpose.Telemetry] = "100000000000000001";
            settings.forumTags[ShotStatus.Claimed] = "100000000000000002";
            settings.notificationCursor = "17-0";
        });
        const reloaded = new SettingsStore(directory);
        await reloaded.load();
        expect(reloaded.channel(ChannelPurpose.Telemetry)).toBe("100000000000000001");
        expect(reloaded.forumTag(ShotStatus.Claimed)).toBe("100000000000000002");
        expect(reloaded.notificationCursor).toBe("17-0");
        expect(JSON.parse(await readFile(join(directory, "settings.json"), "utf8"))).toMatchObject({ notificationCursor: "17-0" });
    });
});

describe("configuration", () => {
    const valid = {
        NODE_ENV: "production",
        DISCORD_BOT_TOKEN: "x".repeat(70),
        DISCORD_CLIENT_ID: "100000000000000000",
        DISCORD_GUILD_ID: "100000000000000001",
        API_BASE_URL: "http://api:3333/api/v1/",
        SERVICE_TOKEN: "s".repeat(40),
        WEB_APP_URL: "https://app.example.com"
    };

    it("accepts the internal compose address and trims trailing slashes", () => {
        expect(loadBotConfiguration(valid).apiBaseUrl).toBe("http://api:3333/api/v1");
    });

    it("rejects plain http to external hosts in production and short service tokens", () => {
        expect(() => loadBotConfiguration({ ...valid, API_BASE_URL: "http://api.example.com/api/v1" })).toThrow(/https/u);
        expect(() => loadBotConfiguration({ ...valid, SERVICE_TOKEN: "short" })).toThrow(/SERVICE_TOKEN/u);
    });
});
