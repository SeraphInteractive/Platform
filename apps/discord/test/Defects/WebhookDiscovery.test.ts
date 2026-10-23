import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DifficultyTier, NotificationType, ShotType, type PlatformNotification } from "@platform/contracts";
import { ChannelType, Collection, WebhookClient, type Client } from "discord.js";
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

    it("must pass withComponents: true, channel display name, and bot avatar when dispatching via webhook", async () => {
        const sendSpy = vi.spyOn(WebhookClient.prototype, "send").mockResolvedValue({ id: "mock-msg-id" } as never);
        const mockTelemetryChannel = {
            id: "telemetry-channel-id",
            name: "telemetry-alerts",
            type: ChannelType.GuildText,
            guildId: "guild-1",
            isSendable: () => true,
            isDMBased: () => false,
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection()),
            createWebhook: vi.fn().mockResolvedValue({ url: "https://discord.com/api/webhooks/discovered/token" }),
            send: vi.fn()
        };

        const mockClient = {
            user: {
                avatar: "custom_avatar_hash",
                displayAvatarURL: vi.fn().mockReturnValue("https://cdn.discordapp.com/avatars/bot/avatar.png")
            },
            channels: { fetch: vi.fn().mockResolvedValue(mockTelemetryChannel) },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = { threadFor: vi.fn().mockReturnValue(undefined) } as unknown as TaskForum;
        const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

        const dispatcher = new NotificationDispatcher(mockClient, "guild-1", settings, mockForum, mockLogger as never, {
            telemetry:
                "https://discord.com/api/webhooks/1559537699273179156/3Dn7dB6u4d2sjjfy8NQ1-cuPyDrvrakRWnXUeBXZ5RQuAjC_BfHOdQMW94emdzDlNJ9A"
        });

        const sampleNotification: PlatformNotification = {
            type: NotificationType.RoundCreated,
            occurredAt: new Date().toISOString(),
            round: { id: "round-1", title: "Character Design Final", pollType: 0 },
            actor: { discordId: "100000000000000001", username: "admin" },
            opensAt: null,
            closesAt: new Date().toISOString()
        } as unknown as PlatformNotification;

        await dispatcher.handle(sampleNotification);

        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                withComponents: true,
                username: "Project Stairway Telemetry",
                avatarURL: "https://cdn.discordapp.com/avatars/bot/avatar.png"
            })
        );
        sendSpy.mockRestore();
    });

    it("must rename pre-existing webhook entity to target display name when auto-discovered", async () => {
        const telemetryChannelId = "telemetry-channel-id";
        await settings.update((s) => {
            s.channels[ChannelPurpose.Telemetry] = telemetryChannelId;
        });

        const mockExistingWebhook = {
            name: "Spidey Bot",
            url: "https://discord.com/api/webhooks/discovered/token",
            edit: vi.fn().mockResolvedValue(undefined)
        };
        const mockWebhooksCollection = new Collection();
        mockWebhooksCollection.set("webhook-1", mockExistingWebhook);

        const mockTelemetryChannel = {
            id: telemetryChannelId,
            name: "telemetry-alerts",
            type: ChannelType.GuildText,
            guildId: "guild-1",
            isSendable: () => true,
            isDMBased: () => false,
            fetchWebhooks: vi.fn().mockResolvedValue(mockWebhooksCollection),
            createWebhook: vi.fn().mockResolvedValue(mockExistingWebhook),
            send: vi.fn()
        };

        const mockClient = {
            channels: { fetch: vi.fn().mockResolvedValue(mockTelemetryChannel) },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = { threadFor: vi.fn().mockReturnValue(undefined) } as unknown as TaskForum;
        const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

        const dispatcher = new NotificationDispatcher(mockClient, "guild-1", settings, mockForum, mockLogger as never, {});

        const sampleNotification: PlatformNotification = {
            type: NotificationType.RoundCreated,
            occurredAt: new Date().toISOString(),
            round: { id: "round-1", title: "Character Design Final", pollType: 0 },
            actor: { discordId: "100000000000000001", username: "admin" },
            opensAt: null,
            closesAt: new Date().toISOString()
        } as unknown as PlatformNotification;

        const sendSpy = vi.spyOn(WebhookClient.prototype, "send").mockResolvedValue({ id: "mock-msg-id" } as never);
        await dispatcher.handle(sampleNotification);

        expect(mockExistingWebhook.edit).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Project Stairway Telemetry"
            })
        );
        sendSpy.mockRestore();
    });

    it("must dispatch department task logs with department-specific display name and bot avatar", async () => {
        const sendSpy = vi.spyOn(WebhookClient.prototype, "send").mockResolvedValue({ id: "mock-msg-id" } as never);

        const mockClient = {
            user: {
                avatar: "custom_avatar_hash",
                displayAvatarURL: vi.fn().mockReturnValue("https://cdn.discordapp.com/avatars/bot/avatar.png")
            },
            channels: { fetch: vi.fn().mockResolvedValue(null) },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = {
            ensureThreadFor: vi.fn().mockResolvedValue(undefined),
            setStatus: vi.fn().mockResolvedValue(undefined),
            post: vi.fn().mockResolvedValue(undefined),
            threadFor: vi.fn().mockReturnValue(undefined)
        } as unknown as TaskForum;
        const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Assets",
                    slug: "assets",
                    discordLogsWebhookUrl:
                        "https://discord.com/api/webhooks/1559537699273179157/3Dn7dB6u4d2sjjfy8NQ1-cuPyDrvrakRWnXUeBXZ5RQuAjC_BfHOdQMW94emdzDlNJ9B"
                }
            ])
        };

        const dispatcher = new NotificationDispatcher(
            mockClient,
            "guild-1",
            settings,
            mockForum,
            mockLogger as never,
            {},
            mockApi as never
        );

        const taskNotification: PlatformNotification = {
            type: NotificationType.ShotCreated,
            occurredAt: new Date().toISOString(),
            shot: {
                id: "shot-1",
                code: "SH001",
                title: "Character Rig",
                difficulty: DifficultyTier.Easy,
                sceneNumber: 1,
                shotType: ShotType.Modelling3d
            },
            actor: { discordId: "100000000000000001", username: "supervisor" }
        } as unknown as PlatformNotification;

        await dispatcher.handle(taskNotification);

        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                username: "Project Stairway Assets",
                avatarURL: "https://cdn.discordapp.com/avatars/bot/avatar.png"
            })
        );
        sendSpy.mockRestore();
    });

    it("must fall back to webAppUrl brand avatar when client user avatar is null or unset", async () => {
        const sendSpy = vi.spyOn(WebhookClient.prototype, "send").mockResolvedValue({ id: "mock-msg-id" } as never);

        const mockClient = {
            user: {
                avatar: null,
                displayAvatarURL: vi.fn().mockReturnValue("https://cdn.discordapp.com/embed/avatars/0.png")
            },
            channels: { fetch: vi.fn().mockResolvedValue(null) },
            guilds: {
                fetch: vi.fn().mockResolvedValue({
                    members: { fetch: vi.fn().mockResolvedValue(new Collection()) }
                })
            }
        } as unknown as Client;

        const mockForum = {
            ensureThreadFor: vi.fn().mockResolvedValue(undefined),
            setStatus: vi.fn().mockResolvedValue(undefined),
            post: vi.fn().mockResolvedValue(undefined),
            threadFor: vi.fn().mockReturnValue(undefined)
        } as unknown as TaskForum;
        const mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Assets",
                    slug: "assets",
                    discordLogsWebhookUrl:
                        "https://discord.com/api/webhooks/1559537699273179157/3Dn7dB6u4d2sjjfy8NQ1-cuPyDrvrakRWnXUeBXZ5RQuAjC_BfHOdQMW94emdzDlNJ9B"
                }
            ])
        };

        const dispatcher = new NotificationDispatcher(
            mockClient,
            "guild-1",
            settings,
            mockForum,
            mockLogger as never,
            {},
            mockApi as never,
            "https://dev-app.projectstairway.net"
        );

        const taskNotification: PlatformNotification = {
            type: NotificationType.ShotCreated,
            occurredAt: new Date().toISOString(),
            shot: {
                id: "shot-1",
                code: "SH001",
                title: "Character Rig",
                difficulty: DifficultyTier.Easy,
                sceneNumber: 1,
                shotType: ShotType.Modelling3d
            },
            actor: { discordId: "100000000000000001", username: "supervisor" }
        } as unknown as PlatformNotification;

        await dispatcher.handle(taskNotification);

        expect(sendSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                username: "Project Stairway Assets",
                avatarURL: "https://dev-app.projectstairway.net/branding/bot-pfp.png"
            })
        );
        sendSpy.mockRestore();
    });
});
