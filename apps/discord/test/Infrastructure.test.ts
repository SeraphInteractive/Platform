import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShotStatus } from "@platform/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { parseServerSentEvents } from "../src/Api/NotificationConsumer.js";
import { loadBotConfiguration } from "../src/Configuration/BotConfiguration.js";
import { ChannelPurpose, SettingsStore } from "../src/State/SettingsStore.js";
import { WarningStore } from "../src/State/WarningStore.js";

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
            settings.rulesMessageId = "100000000000000003";
        });
        const reloaded = new SettingsStore(directory);
        await reloaded.load();
        expect(reloaded.channel(ChannelPurpose.Telemetry)).toBe("100000000000000001");
        expect(reloaded.forumTag(ShotStatus.Claimed)).toBe("100000000000000002");
        expect(reloaded.notificationCursor).toBe("17-0");
        expect(reloaded.rulesMessageId).toBe("100000000000000003");
        expect(JSON.parse(await readFile(join(directory, "settings.json"), "utf8"))).toMatchObject({
            notificationCursor: "17-0",
            rulesMessageId: "100000000000000003"
        });
    });

    it("loads from remote API and syncs updates", async () => {
        directory = await mkdtemp(join(tmpdir(), "platform-discord-"));
        let remoteSettings: Record<string, unknown> = {
            guildId: "100000000000000001",
            channels: { [ChannelPurpose.Welcome]: "200000000000000001" },
            roles: {},
            forumTags: {},
            notificationCursor: "5-0",
            rulesMessageId: null
        };
        const mockApi = {
            getDiscordSettings: async () => remoteSettings as never,
            updateDiscordSettings: async (_guildId: string, input: Record<string, unknown>) => {
                remoteSettings = { ...remoteSettings, ...input };
                return remoteSettings as never;
            }
        };
        const store = new SettingsStore(directory, mockApi as never, "100000000000000001");
        await store.load();
        expect(store.channel(ChannelPurpose.Welcome)).toBe("200000000000000001");
        expect(store.notificationCursor).toBe("5-0");

        await store.update((settings) => {
            settings.channels[ChannelPurpose.Telemetry] = "200000000000000002";
        });
        await store.flush();
        expect((remoteSettings.channels as Record<string, string>)[ChannelPurpose.Telemetry]).toBe("200000000000000002");
    });
});

describe("warning store remote sync", () => {
    let directory = "";

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("loads from remote API and syncs mutations and resets", async () => {
        directory = await mkdtemp(join(tmpdir(), "platform-warnings-"));
        const remoteRecords = new Map<string, Record<string, unknown>>([
            [
                "user1",
                {
                    userId: "user1",
                    offenceLevel: 1,
                    stageWarnings: 2,
                    infractions: [],
                    timeouts: [],
                    apology: { status: "none", text: null, submittedAt: null }
                }
            ]
        ]);

        const mockApi = {
            listModerationRecords: async () => Array.from(remoteRecords.values()) as never,
            updateModerationRecord: async (userId: string, input: Record<string, unknown>) => {
                remoteRecords.set(userId, { ...remoteRecords.get(userId), ...input, userId });
                return remoteRecords.get(userId) as never;
            },
            deleteModerationRecord: async (userId: string) => {
                remoteRecords.delete(userId);
                return true;
            }
        };

        const store = new WarningStore(directory, mockApi as never);
        await store.load();

        const record = store.getRecord("user1");
        expect(record?.offenceLevel).toBe(1);
        expect(record?.stageWarnings).toBe(2);

        // mutate user1 (reaches 3 warnings in stage 1, promoting to stage 2)
        store.addWarning("user1", "bad language", "chan1", "snippet");
        await store.flush();
        expect(remoteRecords.get("user1")?.offenceLevel).toBe(2);
        expect(remoteRecords.get("user1")?.stageWarnings).toBe(0);

        // reset user1
        store.resetUser("user1");
        await store.flush();
        expect(remoteRecords.has("user1")).toBe(false);
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

    it("parses optional webhook URLs and treats empty strings as undefined", () => {
        const config = loadBotConfiguration({
            ...valid,
            DISCORD_ANNOUNCEMENTS_CHANNEL_ID: "",
            DISCORD_TELEMETRY_WEBHOOK_URL: "https://discord.com/api/webhooks/2/telemetry-token",
            DISCORD_MODERATION_LOGS_WEBHOOK_URL: "https://discord.com/api/webhooks/3/mod-token",
            DISCORD_RULES_WEBHOOK_URL: "https://discord.com/api/webhooks/4/rules-token"
        });
        expect(config.announcementsChannelId).toBeUndefined();
        expect(config.telemetryWebhookUrl).toBe("https://discord.com/api/webhooks/2/telemetry-token");
        expect(config.moderationLogsWebhookUrl).toBe("https://discord.com/api/webhooks/3/mod-token");
        expect(config.rulesWebhookUrl).toBe("https://discord.com/api/webhooks/4/rules-token");
    });
});
