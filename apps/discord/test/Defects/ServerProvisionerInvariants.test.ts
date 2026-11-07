import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, Collection, type Guild, type GuildBasedChannel, type Role } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerProvisioner } from "../../src/Services/ServerProvisioner.js";
import { SettingsStore } from "../../src/State/SettingsStore.js";

interface MockChannelData {
    id: string;
    name: string;
    type: ChannelType;
    parentId?: string;
    [key: string]: unknown;
}

function mockChannel(id: string, name: string, type: ChannelType, parentId?: string): MockChannelData {
    const rolesColl = new Collection<string, Role>();
    return {
        id,
        name,
        type,
        parentId,
        guild: {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id" },
                fetch: vi.fn().mockResolvedValue(rolesColl),
                cache: rolesColl
            }
        },
        delete: vi.fn().mockResolvedValue(undefined),
        setParent: vi.fn().mockResolvedValue(undefined),
        setName: vi.fn().mockResolvedValue(undefined),
        setPosition: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue({ pin: vi.fn().mockResolvedValue(undefined) }),
        threads: {
            fetchActive: vi.fn().mockResolvedValue({ threads: new Collection() }),
            fetchArchived: vi.fn().mockResolvedValue({ threads: new Collection() })
        },
        availableTags: [],
        setAvailableTags: vi
            .fn()
            .mockImplementation((tags: { name: string }[]) =>
                Promise.resolve({ availableTags: tags.map((t, i) => ({ id: `tag-${i}`, name: t.name })) })
            ),
        permissionOverwrites: {
            create: vi.fn().mockResolvedValue(undefined),
            set: vi.fn().mockResolvedValue(undefined)
        },
        messages: {
            fetchPinned: vi.fn().mockResolvedValue(new Collection())
        },
        fetchWebhooks: vi.fn().mockResolvedValue(new Collection()),
        createWebhook: vi.fn().mockResolvedValue({
            id: "mock-created-hook",
            name: "Studio Announcements",
            url: "https://discord.com/api/webhooks/100000000000000001/mock_token_000000000000000000000000000000000000000000000000000000000000",
            delete: vi.fn().mockResolvedValue(undefined)
        })
    };
}

// b8: non-destructive server setup invariant violations in /bot-setup
// invariant: /bot-setup must never re-parent existing channels into default categories,
// never alter channel sidebar order, and never wipe custom permission overwrites on existing channels.
describe("b8: ServerProvisioner non-destructive setup invariants", () => {
    let dir = "";
    let settings: SettingsStore;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), "provisioner-invariants-"));
        settings = new SettingsStore(dir);
        await settings.load();
    });

    afterEach(async () => {
        await settings.flush();
        await rm(dir, { recursive: true, force: true });
    });

    it("must never re-parent existing channels into default categories", async () => {
        const existingCategory = mockChannel("custom-archive-category", "Archive", ChannelType.GuildCategory);
        const existingRulesChannel = mockChannel("rules-channel-id", "rules", ChannelType.GuildText, existingCategory.id);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(existingCategory.id, existingCategory as never);
        channels.set(existingRulesChannel.id, existingRulesChannel as never);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id" },
                fetch: vi.fn().mockResolvedValue(new Collection<string, Role>()),
                create: vi.fn().mockImplementation((opts: { name: string }) =>
                    Promise.resolve({
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    })
                )
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(channels),
                create: vi
                    .fn()
                    .mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) =>
                        Promise.resolve(mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent))
                    )
            }
        } as unknown as Guild;

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        };

        const provisioner = new ServerProvisioner(settings, mockLogger as never);
        await provisioner.provision(mockGuild);

        // invariant: existing channels must never be moved or re-parented into bot default categories
        expect(existingRulesChannel.setParent).not.toHaveBeenCalled();
    });

    it("must never alter channel sidebar order via setPosition", async () => {
        const deptCategory = mockChannel("dept-cat-id", "Art and Writing", ChannelType.GuildCategory);
        const deptForum = mockChannel("dept-forum-id", "art-grabbox", ChannelType.GuildForum, deptCategory.id);
        const deptChat = mockChannel("dept-chat-id", "art-general", ChannelType.GuildText, deptCategory.id);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(deptCategory.id, deptCategory as never);
        channels.set(deptForum.id, deptForum as never);
        channels.set(deptChat.id, deptChat as never);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id" },
                fetch: vi.fn().mockResolvedValue(new Collection<string, Role>()),
                create: vi.fn().mockImplementation((opts: { name: string }) =>
                    Promise.resolve({
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    })
                )
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(channels),
                create: vi
                    .fn()
                    .mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) =>
                        Promise.resolve(mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent))
                    )
            }
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Art and Writing",
                    slug: "art-and-writing",
                    contributorSpecialties: [],
                    supervisorSpecialties: []
                }
            ]),
            bindDepartmentDiscordMap: vi.fn().mockResolvedValue(undefined),
            updateDiscordSettings: vi.fn().mockResolvedValue({}),
            getDocument: vi.fn().mockRejectedValue(new Error("no docs"))
        };

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        };

        const provisioner = new ServerProvisioner(settings, mockLogger as never, undefined, mockApi as never);
        await provisioner.provision(mockGuild);

        // invariant: existing channels must never have their position re-ordered
        expect(deptForum.setPosition).not.toHaveBeenCalled();
        expect(deptChat.setPosition).not.toHaveBeenCalled();
    });

    it("must never delete existing channels", async () => {
        const legacyForum = mockChannel("legacy-tasks-id", "tasks", ChannelType.GuildForum);
        const legacySubmissions = mockChannel("legacy-submissions-id", "submissions", ChannelType.GuildText);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(legacyForum.id, legacyForum as never);
        channels.set(legacySubmissions.id, legacySubmissions as never);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id" },
                fetch: vi.fn().mockResolvedValue(new Collection<string, Role>()),
                create: vi.fn().mockImplementation((opts: { name: string }) =>
                    Promise.resolve({
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    })
                )
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(channels),
                create: vi
                    .fn()
                    .mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) =>
                        Promise.resolve(mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent))
                    )
            }
        } as unknown as Guild;

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        };

        const provisioner = new ServerProvisioner(settings, mockLogger as never);
        await provisioner.provision(mockGuild);

        // invariant: /bot-setup must be non-destructive and never delete channels
        expect(legacyForum.delete).not.toHaveBeenCalled();
        expect(legacySubmissions.delete).not.toHaveBeenCalled();
    });

    it("must never wipe custom permission overwrites with permissionOverwrites.set", async () => {
        const forum = {
            id: "forum-1",
            name: "tasks-forum",
            type: ChannelType.GuildForum,
            guild: {
                client: { user: { id: "bot-1" } },
                roles: {
                    everyone: { id: "everyone-id" },
                    fetch: vi.fn().mockResolvedValue(new Collection())
                }
            },
            permissionOverwrites: {
                create: vi.fn().mockResolvedValue(undefined),
                set: vi.fn().mockResolvedValue(undefined)
            }
        };

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        };

        const provisioner = new ServerProvisioner(settings, mockLogger as never);

        // calling ensureForumPermissions without isExisting flag (e.g. default path in provisioner)
        // should never replace all permission overwrites using permissionOverwrites.set()
        await provisioner.ensureForumPermissions(forum as never, false);

        expect(forum.permissionOverwrites.set).not.toHaveBeenCalled();
    });

    it("must purge duplicate and residual webhooks on managed channels and sync system webhooks to database", async () => {
        const announcementsChannel = mockChannel("announcements-id", "announcements", ChannelType.GuildText);
        const validWebhook = {
            id: "valid-hook-id",
            name: "Studio Announcements",
            url: "https://discord.com/api/webhooks/100000000000000001/mock_token_000000000000000000000000000000000000000000000000000000000001",
            delete: vi.fn().mockResolvedValue(undefined)
        };
        const duplicateWebhook = {
            id: "duplicate-hook-id",
            name: "Studio Announcements",
            url: "https://discord.com/api/webhooks/100000000000000002/mock_token_000000000000000000000000000000000000000000000000000000000002",
            delete: vi.fn().mockResolvedValue(undefined)
        };
        const residualWebhook = {
            id: "residual-hook-id",
            name: "Rogue Spammer Webhook",
            url: "https://discord.com/api/webhooks/100000000000000003/mock_token_000000000000000000000000000000000000000000000000000000000003",
            delete: vi.fn().mockResolvedValue(undefined)
        };
        const announcementsWebhooks = new Collection<string, unknown>();
        announcementsWebhooks.set(validWebhook.id, validWebhook);
        announcementsWebhooks.set(duplicateWebhook.id, duplicateWebhook);
        announcementsWebhooks.set(residualWebhook.id, residualWebhook);
        announcementsChannel.fetchWebhooks = vi.fn().mockResolvedValue(announcementsWebhooks);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(announcementsChannel.id, announcementsChannel as never);

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([]),
            bindDepartmentDiscordMap: vi.fn().mockResolvedValue(undefined),
            updateDiscordSettings: vi.fn().mockResolvedValue({}),
            getDocument: vi.fn().mockRejectedValue(new Error("no docs"))
        };

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id" },
                fetch: vi.fn().mockResolvedValue(new Collection<string, Role>()),
                create: vi.fn().mockImplementation((opts: { name: string }) =>
                    Promise.resolve({
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    })
                )
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(channels),
                create: vi
                    .fn()
                    .mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) =>
                        Promise.resolve(mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent))
                    )
            },
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection())
        } as unknown as Guild;

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        };

        const provisioner = new ServerProvisioner(settings, mockLogger as never, undefined, mockApi as never);
        const summary = await provisioner.provision(mockGuild);

        // invariant: active valid webhook is kept intact
        expect(validWebhook.delete).not.toHaveBeenCalled();

        // invariant: duplicate webhook with same name is purged
        expect(duplicateWebhook.delete).toHaveBeenCalled();

        // invariant: rogue/residual webhook on system channel is purged
        expect(residualWebhook.delete).toHaveBeenCalled();

        // invariant: deleted residuals are recorded in summary
        expect(summary.deletedWebhooks).toBeDefined();
        expect(summary.deletedWebhooks?.length).toBeGreaterThanOrEqual(2);

        // invariant: webhooks are synchronized to API and database
        expect(mockApi.updateDiscordSettings).toHaveBeenCalledWith(
            "guild-1",
            expect.objectContaining({
                webhooks: expect.objectContaining({
                    announcements: validWebhook.url
                })
            })
        );
    });
});
