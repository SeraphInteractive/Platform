import { NotificationType, Role, Specialty } from "@platform/contracts";
import type { Collection, GuildMember, Role as DiscordRole } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "../src/Services/NotificationDispatcher.js";
import {
    contributorRoleName,
    observerRoleName,
    syncMemberStudioRoles,
    targetStudioRoleNames
} from "../src/Services/StudioRoles.js";
import { SettingsStore } from "../src/State/SettingsStore.js";

function createMockDiscordRole(id: string, name: string): DiscordRole {
    return { id, name } as unknown as DiscordRole;
}

function createMockMember(roleMap: Map<string, DiscordRole>, guildRoles: Map<string, DiscordRole>): {
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
    it("returns Observer for unverified members", () => {
        const names = targetStudioRoleNames(Role.Member, []);
        expect(names).toEqual(new Set([observerRoleName]));
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

    it("returns executive and department roles based on specialty", () => {
        const names = targetStudioRoleNames(Role.Admin, [Specialty.Producer]);
        expect(names).toEqual(new Set(["Producer"]));
    });
});

describe("syncMemberStudioRoles", () => {
    it("adds missing studio roles and strips obsolete ones without touching non-studio roles", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Observer")],
            ["2", createMockDiscordRole("2", "Voters")],
            ["3", createMockDiscordRole("3", "General Contributors")],
            ["4", createMockDiscordRole("4", "Animators")],
            ["5", createMockDiscordRole("5", "Riggers")],
            ["99", createMockDiscordRole("99", "Server Booster")]
        ]);

        const heldRoles = new Map<string, DiscordRole>([
            ["1", guildRoles.get("1")!],
            ["99", guildRoles.get("99")!]
        ]);

        const { member, added, removed } = createMockMember(heldRoles, guildRoles);

        await syncMemberStudioRoles(member, Role.Contributor, [Specialty.Animator]);

        expect(removed).toEqual(["1"]);
        expect(added).toEqual(["3", "4"]);
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
