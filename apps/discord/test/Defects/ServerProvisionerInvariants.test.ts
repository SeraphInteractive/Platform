import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, Collection, PermissionFlagsBits, type Guild, type GuildBasedChannel, type Role } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerProvisioner } from "../../src/Services/ServerProvisioner.js";
import { ChannelPurpose, SettingsStore } from "../../src/State/SettingsStore.js";

interface MockChannelData {
    id: string;
    name: string;
    type: ChannelType;
    parentId?: string;
    permissionOverwrites: {
        create: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
    };
    setName: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
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
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
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
        const existingAnnouncementsChannel = mockChannel(
            "announcements-channel-id",
            "announcements",
            ChannelType.GuildText,
            existingCategory.id
        );
        const existingRulesChannel = mockChannel("rules-channel-id", "rules", ChannelType.GuildText, existingCategory.id);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(existingCategory.id, existingCategory as never);
        channels.set(existingAnnouncementsChannel.id, existingAnnouncementsChannel as never);
        channels.set(existingRulesChannel.id, existingRulesChannel as never);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
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
        expect(existingAnnouncementsChannel.setParent).not.toHaveBeenCalled();
        expect(existingRulesChannel.setParent).not.toHaveBeenCalled();

        // invariant: manual rules channel is left intact and not bound or webhooked by bot
        expect(settings.channel(ChannelPurpose.Rules)).toBeUndefined();
        expect(existingRulesChannel.createWebhook).not.toHaveBeenCalled();
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
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
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
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
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
        const platformCategory = mockChannel("platform-id", "Platform", ChannelType.GuildCategory);
        const announcementsChannel = mockChannel("announcements-id", "announcements", ChannelType.GuildText, platformCategory.id);
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
        channels.set(platformCategory.id, platformCategory as never);
        channels.set(announcementsChannel.id, announcementsChannel as never);

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([]),
            bindDepartmentDiscordMap: vi.fn().mockResolvedValue(undefined),
            updateDiscordSettings: vi.fn().mockResolvedValue({}),
            getDocument: vi.fn().mockRejectedValue(new Error("no docs"))
        };

        const residualStudioRulesWebhook = {
            id: "residual-rules-hook-id",
            name: "Studio Rules",
            url: "https://discord.com/api/webhooks/100000000000000004/mock_token_000000000000000000000000000000000000000000000000000000000004",
            delete: vi.fn().mockResolvedValue(undefined)
        };
        const guildWebhooks = new Collection<string, unknown>();
        guildWebhooks.set(residualStudioRulesWebhook.id, residualStudioRulesWebhook);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
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
            fetchWebhooks: vi.fn().mockResolvedValue(guildWebhooks)
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

        // invariant: residual studio rules webhook in guild is purged
        expect(residualStudioRulesWebhook.delete).toHaveBeenCalled();

        // invariant: deleted residuals are recorded in summary
        expect(summary.deletedWebhooks).toBeDefined();
        expect(summary.deletedWebhooks?.length).toBeGreaterThanOrEqual(3);

        // invariant: webhooks are synchronized to API and database without rules webhook
        expect(mockApi.updateDiscordSettings).toHaveBeenCalledWith(
            "guild-1",
            expect.objectContaining({
                webhooks: expect.objectContaining({
                    announcements: validWebhook.url
                })
            })
        );
        const savedWebhooks = (mockApi.updateDiscordSettings.mock.calls[0]![1] as { webhooks: Record<string, string> }).webhooks;
        expect(savedWebhooks.rules).toBeUndefined();
        expect(settings.channel(ChannelPurpose.Rules)).toBeUndefined();
    });

    it("locks down active department channels and removes image perms from everyone role", async () => {
        const everyoneSetPerms = vi.fn().mockResolvedValue(undefined);
        const rolesColl = new Collection<string, Role>();
        const createdChannelsMap = new Map<string, MockChannelData>();
        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id", setPermissions: everyoneSetPerms },
                fetch: vi.fn().mockResolvedValue(rolesColl),
                create: vi.fn().mockImplementation((opts: { name: string; permissions?: bigint[] }) => {
                    const role = {
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        permissions: opts.permissions,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    };
                    rolesColl.set(role.id, role as unknown as Role);
                    return Promise.resolve(role);
                })
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(new Collection<string, GuildBasedChannel>()),
                create: vi.fn().mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) => {
                    const chan = mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent);
                    createdChannelsMap.set(opts.name, chan);
                    return Promise.resolve(chan);
                })
            },
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection())
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Art and Writing",
                    slug: "art-and-writing",
                    contributorSpecialties: ["concept_artist"],
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

        // invariant: everyone role permissions are set to memberPermissions (text-only, connect allowed, no speaking or media)
        expect(everyoneSetPerms).toHaveBeenCalled();
        const calledPerms = everyoneSetPerms.mock.calls[0]![0];
        expect(calledPerms).toContain(PermissionFlagsBits.SendMessages);
        expect(calledPerms).toContain(PermissionFlagsBits.Connect);
        expect(calledPerms).not.toContain(PermissionFlagsBits.Speak);
        expect(calledPerms).not.toContain(PermissionFlagsBits.AttachFiles);
        expect(calledPerms).not.toContain(PermissionFlagsBits.EmbedLinks);

        // invariant: members role permissions match memberPermissions
        const membersRole = rolesColl.get("role-Members");
        expect(membersRole).toBeDefined();
        const memberPerms = (membersRole as unknown as { permissions: bigint[] }).permissions;
        expect(memberPerms).toContain(PermissionFlagsBits.Connect);
        expect(memberPerms).toContain(PermissionFlagsBits.SendMessages);
        expect(memberPerms).not.toContain(PermissionFlagsBits.Speak);
        expect(memberPerms).not.toContain(PermissionFlagsBits.AttachFiles);
        expect(memberPerms).not.toContain(PermissionFlagsBits.EmbedLinks);

        // invariant: voters role permissions allow speaking and media
        const votersRole = rolesColl.get("role-Voters");
        expect(votersRole).toBeDefined();
        const voterPerms = (votersRole as unknown as { permissions: bigint[] }).permissions;
        expect(voterPerms).toContain(PermissionFlagsBits.Connect);
        expect(voterPerms).toContain(PermissionFlagsBits.Speak);
        expect(voterPerms).toContain(PermissionFlagsBits.Stream);
        expect(voterPerms).toContain(PermissionFlagsBits.UseVAD);
        expect(voterPerms).toContain(PermissionFlagsBits.AttachFiles);
        expect(voterPerms).toContain(PermissionFlagsBits.EmbedLinks);

        // invariant: active department channels are created and configured
        const deptChat = createdChannelsMap.get("art-general");
        expect(deptChat).toBeDefined();

        const deptGrabbox = createdChannelsMap.get("Art-Writing-GrabBox");
        expect(deptGrabbox).toBeDefined();

        const deptVoice = createdChannelsMap.get("Art and Writing General");
        expect(deptVoice).toBeDefined();
    });

    it("provisions production announcements, general, and isolated management channels with grab-box visibility", async () => {
        const rolesColl = new Collection<string, Role>();
        const createdChannelsMap = new Map<
            string,
            MockChannelData & { opts?: { permissionOverwrites?: { id: string; allow?: bigint[]; deny?: bigint[] }[] } }
        >();
        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
                fetch: vi.fn().mockResolvedValue(rolesColl),
                cache: rolesColl,
                setPositions: vi.fn().mockResolvedValue(new Collection()),
                create: vi.fn().mockImplementation((opts: { name: string }) => {
                    const role = {
                        id: `role-${opts.name}`,
                        name: opts.name,
                        hoist: false,
                        setHoist: vi.fn(),
                        setPermissions: vi.fn()
                    };
                    rolesColl.set(role.id, role as unknown as Role);
                    return Promise.resolve(role);
                })
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(new Collection<string, GuildBasedChannel>()),
                create: vi
                    .fn()
                    .mockImplementation(
                        (opts: {
                            name: string;
                            type: ChannelType;
                            parent?: string;
                            permissionOverwrites?: { id: string; allow?: bigint[]; deny?: bigint[] }[];
                        }) => {
                            const chan = mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent);
                            (chan as unknown as { opts: typeof opts }).opts = opts;
                            createdChannelsMap.set(opts.name, chan);
                            return Promise.resolve(chan);
                        }
                    )
            },
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection())
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Art and Writing",
                    slug: "art-and-writing",
                    contributorSpecialties: ["concept_artist"],
                    supervisorSpecialties: ["art_director"]
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

        // invariant: production announcements channel exists with read-only permissions for contributors
        const prodAnnouncements = createdChannelsMap.get("production-announcements");
        expect(prodAnnouncements).toBeDefined();
        const prodAnnounceOverwrites = prodAnnouncements?.opts?.permissionOverwrites;
        expect(prodAnnounceOverwrites).toBeDefined();
        const everyoneAnnounce = prodAnnounceOverwrites?.find((ow) => ow.id === "everyone-role-id");
        expect(everyoneAnnounce?.deny).toContain(PermissionFlagsBits.ViewChannel);

        // contributor role should have view channel and read message history, but denied send messages
        const contributorRoleOw = prodAnnounceOverwrites?.find((ow) => ow.id === "role-General Contributors");
        expect(contributorRoleOw?.allow).toContain(PermissionFlagsBits.ViewChannel);
        expect(contributorRoleOw?.deny).toContain(PermissionFlagsBits.SendMessages);

        // invariant: production-announcements webhook is configured in settings
        const webhookUrl = settings.webhook("production-announcements");
        expect(webhookUrl).toBeDefined();

        // invariant: production-management channel is restricted strictly to supervisors and executives
        const prodManagement = createdChannelsMap.get("production-management");
        expect(prodManagement).toBeDefined();
        const prodMgmtOverwrites = prodManagement?.opts?.permissionOverwrites;
        expect(prodMgmtOverwrites).toBeDefined();
        const everyoneMgmt = prodMgmtOverwrites?.find((ow) => ow.id === "everyone-role-id");
        expect(everyoneMgmt?.deny).toContain(PermissionFlagsBits.ViewChannel);

        // contributors should NOT be present in production-management allow overwrites
        const contributorInMgmt = prodMgmtOverwrites?.find((ow) => ow.id === "role-General Contributors");
        expect(contributorInMgmt).toBeUndefined();
        const conceptArtistInMgmt = prodMgmtOverwrites?.find((ow) => ow.id === "role-Concept Artists");
        expect(conceptArtistInMgmt).toBeUndefined();

        // media team (tier 1 department role) should NOT be in production-management
        const mediaTeamInMgmt = prodMgmtOverwrites?.find((ow) => ow.id === "role-Media Team");
        expect(mediaTeamInMgmt).toBeUndefined();

        // department supervisor / executive roles should have view permissions
        const supervisorInMgmt = prodMgmtOverwrites?.find((ow) => ow.id === "role-Art Director");
        expect(supervisorInMgmt?.allow).toContain(PermissionFlagsBits.ViewChannel);

        // invariant: grab-box forum gives @everyone read-only view perms while department contributors can send messages in threads
        const grabbox = createdChannelsMap.get("Art-Writing-GrabBox");
        const grabboxMock = grabbox as unknown as {
            permissionOverwrites?: {
                create?: { mock: { calls: [string, Record<string, boolean>][] } };
            };
        };
        const createCalls = grabboxMock?.permissionOverwrites?.create;
        expect(createCalls).toBeDefined();
        if (createCalls === undefined) {
            throw new Error("missing createCalls mock");
        }
        expect(createCalls.mock.calls.length).toBeGreaterThan(0);

        const everyoneGrabboxCall = createCalls.mock.calls.find((c) => c[0] === "everyone-role-id");
        expect(everyoneGrabboxCall).toBeDefined();
        expect(everyoneGrabboxCall?.[1]).toMatchObject({
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessagesInThreads: false
        });

        const contributorGrabboxCall = createCalls.mock.calls.find((c) => c[0] === "role-Concept Artists");
        expect(contributorGrabboxCall).toBeDefined();
        expect(contributorGrabboxCall?.[1]).toMatchObject({
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessagesInThreads: true,
            AttachFiles: true,
            EmbedLinks: true
        });

        // invariant: department log channel is restricted strictly to department supervisors
        const logsChannel = createdChannelsMap.get("art-logs");
        expect(logsChannel).toBeDefined();
        const logsOverwrites = logsChannel?.opts?.permissionOverwrites;
        expect(logsOverwrites).toBeDefined();
        const everyoneLogs = logsOverwrites?.find((ow) => ow.id === "everyone-role-id");
        expect(everyoneLogs?.deny).toContain(PermissionFlagsBits.ViewChannel);

        const supervisorLogs = logsOverwrites?.find((ow) => ow.id === "role-Art Director");
        expect(supervisorLogs?.allow).toContain(PermissionFlagsBits.ViewChannel);
        expect(supervisorLogs?.allow).toContain(PermissionFlagsBits.ManageMessages);

        const contributorLogs = logsOverwrites?.find((ow) => ow.id === "role-Concept Artists");
        expect(contributorLogs).toBeUndefined();
    });

    it("never adopts, renames, or touches channels outside managed categories", async () => {
        const externalCategory = mockChannel("ext-cat-id", "Voice channels", ChannelType.GuildCategory);
        const externalVoice = mockChannel("ext-voice-id", "General", ChannelType.GuildVoice, externalCategory.id);
        const externalTextCat = mockChannel("ext-text-cat-id", "Text channels", ChannelType.GuildCategory);
        const externalText = mockChannel("ext-text-id", "general", ChannelType.GuildText, externalTextCat.id);

        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(externalCategory.id, externalCategory as never);
        channels.set(externalVoice.id, externalVoice as never);
        channels.set(externalTextCat.id, externalTextCat as never);
        channels.set(externalText.id, externalText as never);

        const rolesColl = new Collection<string, Role>();
        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: { id: "everyone-role-id", setPermissions: vi.fn().mockResolvedValue(undefined) },
                fetch: vi.fn().mockResolvedValue(rolesColl),
                cache: rolesColl,
                setPositions: vi.fn().mockResolvedValue(new Collection()),
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
                create: vi.fn().mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) => {
                    const chan = mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent);
                    channels.set(chan.id, chan as never);
                    return Promise.resolve(chan);
                })
            },
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection())
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Art and Writing",
                    slug: "art-and-writing",
                    contributorSpecialties: ["concept_artist"],
                    supervisorSpecialties: ["art_director"]
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

        // external channels outside managed categories must never be renamed
        expect(externalVoice.setName).not.toHaveBeenCalled();
        expect(externalText.setName).not.toHaveBeenCalled();

        // external channels outside managed categories must never have overwrites modified
        const voiceOverwrites = externalVoice.permissionOverwrites as { create: ReturnType<typeof vi.fn> };
        const textOverwrites = externalText.permissionOverwrites as { create: ReturnType<typeof vi.fn> };
        expect(voiceOverwrites.create).not.toHaveBeenCalled();
        expect(textOverwrites.create).not.toHaveBeenCalled();

        // external channels must never be re-parented
        expect(externalVoice.setParent).not.toHaveBeenCalled();
        expect(externalText.setParent).not.toHaveBeenCalled();
    });

    it("renames legacy department info channels to announcements", async () => {
        const rolesColl = new Collection<string, Role>();
        const everyoneRole = {
            id: "everyone-role-id",
            name: "@everyone",
            setPermissions: vi.fn().mockResolvedValue(undefined)
        } as unknown as Role;
        rolesColl.set(everyoneRole.id, everyoneRole);

        const artCategory = mockChannel("cat-art", "Art and Writing", ChannelType.GuildCategory);
        const legacyArtInfo = mockChannel("chan-art-info", "art-info", ChannelType.GuildText, "cat-art");
        const channels = new Collection<string, GuildBasedChannel>();
        channels.set(artCategory.id, artCategory as never);
        channels.set(legacyArtInfo.id, legacyArtInfo as never);

        const mockGuild = {
            id: "guild-1",
            client: { user: { id: "bot-user-1" } },
            roles: {
                everyone: everyoneRole,
                fetch: vi.fn().mockResolvedValue(rolesColl),
                cache: rolesColl,
                setPositions: vi.fn().mockResolvedValue(new Collection()),
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
                create: vi.fn().mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) => {
                    const chan = mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent);
                    channels.set(chan.id, chan as never);
                    return Promise.resolve(chan);
                })
            },
            fetchWebhooks: vi.fn().mockResolvedValue(new Collection())
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([
                {
                    id: "dept-1",
                    name: "Art and Writing",
                    slug: "art-and-writing",
                    contributorSpecialties: ["concept_artist"],
                    supervisorSpecialties: ["art_director"]
                }
            ]),
            bindDepartmentDiscordMap: vi.fn().mockResolvedValue(undefined),
            updateDiscordSettings: vi.fn().mockResolvedValue({}),
            getDocument: vi.fn().mockRejectedValue(new Error("no docs"))
        };

        const provisioner = new ServerProvisioner(
            settings,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
            undefined,
            mockApi as never
        );
        await provisioner.provision(mockGuild);

        expect(legacyArtInfo.setName).toHaveBeenCalledWith("art-announcements", "Rename to department announcements");
    });

    it("preserves preexisting information board channels and configures announcements webhook without renaming or overwriting perms", async () => {
        const infoBoardCategory = mockChannel("info-board-id", "Information Board", ChannelType.GuildCategory);
        const rulesChan = mockChannel("rules-id", "📜rules", ChannelType.GuildText, infoBoardCategory.id);
        const projInfoChan = mockChannel("proj-id", "📝project-information", ChannelType.GuildText, infoBoardCategory.id);
        const faqChan = mockChannel("faq-id", "🔍faq", ChannelType.GuildText, infoBoardCategory.id);
        const announceChan = mockChannel("announce-id", "📢announcements", ChannelType.GuildText, infoBoardCategory.id);
        const qnaChan = mockChannel("qna-id", "🤔qna", ChannelType.GuildText, infoBoardCategory.id);
        const ticketsChan = mockChannel("tickets-id", "🎟️tickets", ChannelType.GuildText, infoBoardCategory.id);
        const stairboardChan = mockChannel("stairboard-id", "🪜stairboard", ChannelType.GuildText, infoBoardCategory.id);

        const customTicketsHook = {
            id: "custom-tickets-hook-id",
            name: "Ticket Dispatcher",
            channelId: ticketsChan.id,
            url: "https://discord.com/api/webhooks/100000000000000099/mock_token",
            delete: vi.fn().mockResolvedValue(undefined)
        };

        const channels = new Collection<string, GuildBasedChannel>();
        for (const ch of [infoBoardCategory, rulesChan, projInfoChan, faqChan, announceChan, qnaChan, ticketsChan, stairboardChan]) {
            channels.set(ch.id, ch as never);
        }

        const guildWebhooks = new Collection<string, unknown>();
        guildWebhooks.set(customTicketsHook.id, customTicketsHook);

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
                create: vi.fn().mockImplementation((opts: { name: string; type: ChannelType; parent?: string }) => {
                    const chan = mockChannel(`chan-${opts.name}`, opts.name, opts.type, opts.parent);
                    channels.set(chan.id, chan as never);
                    return Promise.resolve(chan);
                })
            },
            fetchWebhooks: vi.fn().mockResolvedValue(guildWebhooks)
        } as unknown as Guild;

        const mockApi = {
            listDepartments: vi.fn().mockResolvedValue([]),
            bindDepartmentDiscordMap: vi.fn().mockResolvedValue(undefined),
            updateDiscordSettings: vi.fn().mockResolvedValue({}),
            getDocument: vi.fn().mockRejectedValue(new Error("no docs"))
        };

        const provisioner = new ServerProvisioner(
            settings,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
            undefined,
            mockApi as never
        );

        const summary = await provisioner.provision(mockGuild);

        // invariant: information board category was discovered and not recreated as platform
        const createdCategoryNames = (mockGuild.channels.create as ReturnType<typeof vi.fn>).mock.calls
            .filter((c: unknown[]) => (c[0] as { type: ChannelType }).type === ChannelType.GuildCategory)
            .map((c: unknown[]) => (c[0] as { name: string }).name);
        expect(createdCategoryNames).not.toContain("Platform");
        expect(createdCategoryNames).not.toContain("Information Board");

        // invariant: announcements was bound with custom emoji name preserved and perms not overwritten
        expect(announceChan.setName).not.toHaveBeenCalled();
        expect(announceChan.permissionOverwrites.create).not.toHaveBeenCalled();
        expect(summary.boundChannels).toContain("#📢announcements");

        // invariant: preexisting channels under information board were never modified or bound
        for (const untouched of [rulesChan, projInfoChan, faqChan, qnaChan, ticketsChan, stairboardChan]) {
            expect(untouched.setName).not.toHaveBeenCalled();
            expect(untouched.delete).not.toHaveBeenCalled();
            expect(untouched.permissionOverwrites.create).not.toHaveBeenCalled();
            expect(summary.boundChannels).not.toContain(`#${untouched.name}`);
        }

        // invariant: webhooks on preexisting information board channels were untouched
        expect(customTicketsHook.delete).not.toHaveBeenCalled();

        // invariant: settings bound announcements and discarded rules
        expect(settings.channel(ChannelPurpose.Announcements)).toBe(announceChan.id);
        expect(settings.channel(ChannelPurpose.Rules)).toBeUndefined();
    });
});
