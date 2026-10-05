import { NotificationType, Role, Specialty } from "@platform/contracts";
import type { Collection, GuildMember, Role as DiscordRole } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "../src/Services/NotificationDispatcher.js";
import { ServerProvisioner } from "../src/Services/ServerProvisioner.js";
import { contributorRoleName, syncMemberStudioRoles, targetStudioRoleNames } from "../src/Services/StudioRoles.js";
import { SettingsStore } from "../src/State/SettingsStore.js";

function createMockDiscordRole(id: string, name: string): DiscordRole {
    return { id, name } as unknown as DiscordRole;
}

function createMockMember(
    roleMap: Map<string, DiscordRole>,
    guildRoles: Map<string, DiscordRole>
): {
    member: GuildMember;
    added: string[];
    removed: string[];
} {
    const added: string[] = [];
    const removed: string[] = [];
    const cache = {
        has: (id: string) => roleMap.has(id)
    } as unknown as Collection<string, DiscordRole>;

    const member = {
        id: "123456789012345678",
        roles: {
            cache,
            add: vi.fn(async (ids: string | string[]) => {
                const list = Array.isArray(ids) ? ids : [ids];
                added.push(...list);
                for (const id of list) {
                    const found = guildRoles.get(id);
                    if (found !== undefined) {
                        roleMap.set(id, found);
                    }
                }
            }),
            remove: vi.fn(async (ids: string | string[]) => {
                const list = Array.isArray(ids) ? ids : [ids];
                removed.push(...list);
                for (const id of list) {
                    roleMap.delete(id);
                }
            })
        },
        guild: {
            roles: {
                fetch: vi.fn(async () => guildRoles)
            }
        }
    } as unknown as GuildMember;

    return { member, added, removed };
}

describe("targetStudioRoleNames", () => {
    it("returns Members for base members", () => {
        const names = targetStudioRoleNames(Role.Member, []);
        expect(names).toEqual(new Set(["Members"]));
    });

    it("returns Voters for verified voters", () => {
        const names = targetStudioRoleNames(Role.Voter, []);
        expect(names).toEqual(new Set(["Voters"]));
    });

    it("returns General Contributors plus craft specialty roles for contributors", () => {
        const names = targetStudioRoleNames(Role.Contributor, [Specialty.Animator, Specialty.Modeler3d]);
        expect(names).toEqual(new Set([contributorRoleName, "Animators", "3D Modelers"]));
    });

    it("returns General Contributors for senior contributors", () => {
        const names = targetStudioRoleNames(Role.SeniorContributor, [Specialty.Rigger]);
        expect(names).toEqual(new Set([contributorRoleName, "Riggers"]));
    });

    it("returns executive and department roles based on specialty plus base leadership roles", () => {
        const adminNames = targetStudioRoleNames(Role.Admin, [Specialty.Producer]);
        expect(adminNames).toEqual(new Set(["Admin", "Producer"]));

        const supervisorNames = targetStudioRoleNames(Role.Supervisor, [Specialty.AnimationSupervisor]);
        expect(supervisorNames).toEqual(new Set(["Supervisor", "Animation Supervisor"]));

        const generalAdminNames = targetStudioRoleNames(Role.Admin, []);
        expect(generalAdminNames).toEqual(new Set(["Admin"]));

        const superAdminNames = targetStudioRoleNames(Role.SuperAdmin, []);
        expect(superAdminNames).toEqual(new Set(["Admin"]));

        const producerAdminNames = targetStudioRoleNames(Role.SuperAdmin, [Specialty.Producer]);
        expect(producerAdminNames).toEqual(new Set(["Admin", "Producer"]));

        const adminWithCraftSpecialty = targetStudioRoleNames(Role.Admin, [Specialty.Animator]);
        expect(adminWithCraftSpecialty).toEqual(new Set(["Admin", "Animators"]));
    });
});

describe("syncMemberStudioRoles", () => {
    it("adds missing studio roles and strips obsolete ones without touching non-studio roles", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Voters")],
            ["2", createMockDiscordRole("2", "General Contributors")],
            ["3", createMockDiscordRole("3", "Animators")],
            ["4", createMockDiscordRole("4", "Riggers")],
            ["99", createMockDiscordRole("99", "Server Booster")]
        ]);

        const heldRoles = new Map<string, DiscordRole>([
            ["1", guildRoles.get("1")!],
            ["99", guildRoles.get("99")!]
        ]);

        const { member, added, removed } = createMockMember(heldRoles, guildRoles);

        await syncMemberStudioRoles(member, Role.Contributor, [Specialty.Animator]);

        expect(removed).toEqual(["1"]);
        expect(new Set(added)).toEqual(new Set(["2", "3"]));
        expect(heldRoles.has("99")).toBe(true);
    });

    it("strips legacy Observer role and supports alias matching", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["10", createMockDiscordRole("10", "Observer")],
            ["20", createMockDiscordRole("20", "Supervisors")],
            ["30", createMockDiscordRole("30", "Animator")],
            ["99", createMockDiscordRole("99", "VIP")]
        ]);

        const heldRoles = new Map<string, DiscordRole>([
            ["10", guildRoles.get("10")!],
            ["99", guildRoles.get("99")!]
        ]);

        const { member, added, removed } = createMockMember(heldRoles, guildRoles);

        await syncMemberStudioRoles(member, Role.Supervisor, [Specialty.Animator]);

        expect(removed).toEqual(["10"]);
        expect(new Set(added)).toEqual(new Set(["20", "30"]));
        expect(heldRoles.has("99")).toBe(true);
    });
});

describe("NotificationDispatcher moderation and role sync side effects", () => {
    it("bans blacklisted users from the discord guild", async () => {
        const banFn = vi.fn(async () => undefined);
        const mockGuild = {
            members: {
                cache: new Map(),
                ban: banFn,
                fetch: vi.fn(async () => null)
            },
            bans: {
                remove: vi.fn()
            }
        };
        const mockClient = {
            guilds: {
                fetch: vi.fn(async () => mockGuild)
            },
            channels: {
                fetch: vi.fn(async () => null)
            }
        };

        const settings = new SettingsStore("/tmp/test-settings");
        const dispatcher = new NotificationDispatcher(
            mockClient as any,
            "100000000000000001",
            settings,
            { threadFor: () => undefined } as any,
            { warn: vi.fn(), info: vi.fn() } as any
        );

        await dispatcher.handle({
            type: NotificationType.UserBlacklisted,
            occurredAt: new Date().toISOString(),
            user: { discordId: "215537065863938049", username: "badactor" },
            actor: { discordId: "100000000000000000", username: "admin" },
            reason: "sockpuppet abuse"
        });

        expect(banFn).toHaveBeenCalledWith("215537065863938049", { reason: "sockpuppet abuse" });
    });

    it("unbans reinstated users from the discord guild", async () => {
        const unbanFn = vi.fn(async () => undefined);
        const mockGuild = {
            members: {
                cache: new Map(),
                ban: vi.fn(),
                fetch: vi.fn(async () => null)
            },
            bans: {
                remove: unbanFn
            }
        };
        const mockClient = {
            guilds: {
                fetch: vi.fn(async () => mockGuild)
            },
            channels: {
                fetch: vi.fn(async () => null)
            }
        };

        const settings = new SettingsStore("/tmp/test-settings");
        const dispatcher = new NotificationDispatcher(
            mockClient as any,
            "100000000000000001",
            settings,
            { threadFor: () => undefined } as any,
            { warn: vi.fn(), info: vi.fn() } as any
        );

        await dispatcher.handle({
            type: NotificationType.UserReinstated,
            occurredAt: new Date().toISOString(),
            user: { discordId: "215537065863938049", username: "reinstateduser" },
            actor: { discordId: "100000000000000000", username: "admin" }
        });

        expect(unbanFn).toHaveBeenCalledWith("215537065863938049", "Reinstated on platform");
    });
});

describe("ServerProvisioner hierarchy", () => {
    it("sorts guild role positions from Executive down to Community", async () => {
        const setPositionsFn = vi.fn(async (_positions: { role: string; position: number }[]) => undefined);
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Producer")],
            ["2", createMockDiscordRole("2", "Admin")],
            ["3", createMockDiscordRole("3", "Supervisor")],
            ["4", createMockDiscordRole("4", "Animators")],
            ["5", createMockDiscordRole("5", "Voters")]
        ]);

        const mockGuild = {
            roles: {
                fetch: vi.fn(async () => guildRoles),
                setPositions: setPositionsFn
            }
        };

        const settings = new SettingsStore("/tmp/test-settings-hierarchy");
        const provisioner = new ServerProvisioner(settings, { warn: vi.fn(), info: vi.fn() } as any);

        const count = await provisioner.enforceRoleHierarchy(mockGuild as any);
        expect(count).toBe(5);
        expect(setPositionsFn).toHaveBeenCalled();

        const positions = setPositionsFn.mock.calls[0]![0] as { role: string; position: number }[];
        const posMap = new Map(positions.map((p) => [p.role, p.position]));

        // Producer > Admin > Supervisor > Animators > Voters
        expect(posMap.get("1")!).toBeGreaterThan(posMap.get("2")!);
        expect(posMap.get("2")!).toBeGreaterThan(posMap.get("3")!);
        expect(posMap.get("3")!).toBeGreaterThan(posMap.get("4")!);
        expect(posMap.get("4")!).toBeGreaterThan(posMap.get("5")!);
    });

    it("orders Media Team under Supervisor and above Animators", async () => {
        const setPositionsFn = vi.fn(async (_positions: { role: string; position: number }[]) => undefined);
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Supervisor")],
            ["2", createMockDiscordRole("2", "Media Team")],
            ["3", createMockDiscordRole("3", "Animators")]
        ]);

        const mockGuild = {
            roles: {
                fetch: vi.fn(async () => guildRoles),
                setPositions: setPositionsFn
            }
        };

        const settings = new SettingsStore("/tmp/test-settings-media-hierarchy");
        const provisioner = new ServerProvisioner(settings, { warn: vi.fn(), info: vi.fn() } as any);

        await provisioner.enforceRoleHierarchy(mockGuild as any);
        const positions = setPositionsFn.mock.calls[0]![0] as { role: string; position: number }[];
        const posMap = new Map(positions.map((p) => [p.role, p.position]));

        // supervisor > media team > animators
        expect(posMap.get("1")!).toBeGreaterThan(posMap.get("2")!);
        expect(posMap.get("2")!).toBeGreaterThan(posMap.get("3")!);
    });
});
