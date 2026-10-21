import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationType, type PlatformNotification } from "@platform/contracts";
import { ChannelType, Collection, type Client } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "../../src/Services/NotificationDispatcher.js";
import type { TaskForum } from "../../src/Services/TaskForum.js";
import { ChannelPurpose, SettingsStore } from "../../src/State/SettingsStore.js";

// b13: webhook auto-discovery missing / fallback to bot user
// invariant: telemetry alerts, task logs, moderation logs, and live guidelines/rules sync
// use discord webhooks (auto-discovered or created by bot without requiring manual admin creation).
describe("b13: Webhook auto-discovery and bot user fallback", () => {
    let dir = "";
    let settings: SettingsStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "webhook-discovery-"));
        settings = new SettingsStore(dir);
        await settings.load();
    });

    afterEach(async () => {
        await settings.flush();
        await rm(dir, { recursive: true, force: true });
    });

    it("must auto-discover or create webhooks on the target channel when static URLs are not configured", async () => {
        const telemetryChannelId = "telemetry-channel-id";
        await settings.update((s) => {
            s.channels[ChannelPurpose.Telemetry] = telemetryChannelId;
        });

        const mockWebhooksCollection = new Collection();
        const mockTelemetryChannel = {
            id: telemetryChannelId,
            name: "telemetry-alerts",
            type: ChannelType.GuildText,
            guildId: "guild-1",
            isSendable: () => true,
            isDMBased: () => false,
            fetchWebhooks: vi.fn().mockResolvedValue(mockWebhooksCollection),
            createWebhook: vi.fn().mockResolvedValue({
                url: "https://discord.com/api/webhooks/discovered/token",
                send: vi.fn().mockResolvedValue(undefined)
            }),
            send: vi.fn().mockResolvedValue({ id: "msg-as-bot" })
        };

        const mockClient = {
            channels: {
                fetch: vi.fn().mockResolvedValue(mockTelemetryChannel)
            },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = {
            threadFor: vi.fn().mockReturnValue(undefined)
        } as unknown as TaskForum;

        const mockLogger = {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        const dispatcher = new NotificationDispatcher(
            mockClient,
            "guild-1",
            settings,
            mockForum,
            mockLogger as never,
            {} // no static webhook urls
        );

        const sampleNotification: PlatformNotification = {
            type: NotificationType.RoundCreated,
            occurredAt: new Date().toISOString(),
            round: { id: "round-1", title: "Character Design Final", pollType: 0 },
            actor: { discordId: "100000000000000001", username: "admin" },
            opensAt: null,
            closesAt: new Date().toISOString()
        } as unknown as PlatformNotification;

        await dispatcher.handle(sampleNotification);

        // invariant: dispatcher must auto-discover webhooks via channel.fetchWebhooks()
        expect(mockTelemetryChannel.fetchWebhooks).toHaveBeenCalled();
    });

    it("must not fall back to posting directly as the bot user via channel.send()", async () => {
        const telemetryChannelId = "telemetry-channel-id";
        await settings.update((s) => {
            s.channels[ChannelPurpose.Telemetry] = telemetryChannelId;
        });

        const mockTelemetryChannel = {
            id: telemetryChannelId,
            name: "telemetry-alerts",
            type: ChannelType.GuildText,
            guildId: "guild-1",
            isSendable: () => true,
            isDMBased: () => false,
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection()),
            createWebhook: vi.fn().mockResolvedValue({
                url: "https://discord.com/api/webhooks/discovered/token"
            }),
            send: vi.fn().mockResolvedValue({ id: "msg-as-bot" })
        };

        const mockClient = {
            channels: {
                fetch: vi.fn().mockResolvedValue(mockTelemetryChannel)
            },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = {
            threadFor: vi.fn().mockReturnValue(undefined)
        } as unknown as TaskForum;

        const mockLogger = {
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            debug: vi.fn()
        };

        const dispatcher = new NotificationDispatcher(mockClient, "guild-1", settings, mockForum, mockLogger as never, {});

        const sampleNotification: PlatformNotification = {
            type: NotificationType.RoundCreated,
            occurredAt: new Date().toISOString(),
            round: { id: "round-1", title: "Character Design Final", pollType: 0 },
            actor: { discordId: "100000000000000001", username: "admin" },
            opensAt: null,
            closesAt: new Date().toISOString()
        } as unknown as PlatformNotification;

        await dispatcher.handle(sampleNotification);

        // invariant: telemetry alerts must not post under the bot user identity
        expect(mockTelemetryChannel.send).not.toHaveBeenCalled();
    });
});
