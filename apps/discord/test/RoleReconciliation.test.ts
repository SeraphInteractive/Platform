import { Role, Specialty } from "@platform/contracts";
import type { Client, Collection, Guild, GuildMember, Role as DiscordRole, TextChannel } from "discord.js";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";
import type { PlatformApiClient } from "../src/Api/PlatformApiClient.js";
import { RoleReconciliationService } from "../src/Services/RoleReconciliationService.js";
import { getNextScheduledSyncDate } from "../src/Services/RoleSyncScheduler.js";
import type { ServerProvisioner } from "../src/Services/ServerProvisioner.js";
import { syncMemberStudioRoles } from "../src/Services/StudioRoles.js";
import { ChannelPurpose, type SettingsStore } from "../src/State/SettingsStore.js";

function createMockDiscordRole(id: string, name: string): DiscordRole {
    return { id, name } as unknown as DiscordRole;
}

function createMockMember(id: string, roleMap: Map<string, DiscordRole>, guildRoles: Map<string, DiscordRole>): {
    member: GuildMember;
    added: string[];
    removed: string[];
} {
    const added: string[] = [];
    const removed: string[] = [];
    const cache = {
        has: (roleId: string) => roleMap.has(roleId)
    } as unknown as Collection<string, DiscordRole>;

    const member = {
        id,
        roles: {
            cache,
            add: vi.fn(async (ids: string | string[]) => {
                const list = Array.isArray(ids) ? ids : [ids];
                added.push(...list);
                for (const rId of list) {
                    const found = guildRoles.get(rId);
                    if (found !== undefined) {
                        roleMap.set(rId, found);
                    }
                }
            }),
            remove: vi.fn(async (ids: string | string[]) => {
                const list = Array.isArray(ids) ? ids : [ids];
                removed.push(...list);
                for (const rId of list) {
                    roleMap.delete(rId);
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

describe("getNextScheduledSyncDate", () => {
    it("schedules for coming Sunday at 03:00 UTC from a Wednesday", () => {
        // Wednesday 2026-10-07 15:30:00 UTC
        const from = new Date(Date.UTC(2026, 9, 7, 15, 30, 0));
        const next = getNextScheduledSyncDate(from);
        expect(next.toISOString()).toBe("2026-10-11T03:00:00.000Z");
        expect(next.getUTCDay()).toBe(0);
        expect(next.getUTCHours()).toBe(3);
        expect(next.getUTCMinutes()).toBe(0);
    });

    it("schedules for today at 03:00 UTC if currently Sunday morning before 03:00 UTC", () => {
        // Sunday 2026-10-11 01:15:00 UTC
        const from = new Date(Date.UTC(2026, 9, 11, 1, 15, 0));
        const next = getNextScheduledSyncDate(from);
        expect(next.toISOString()).toBe("2026-10-11T03:00:00.000Z");
    });

    it("schedules for next Sunday if currently Sunday after 03:00 UTC", () => {
        // Sunday 2026-10-11 04:00:00 UTC
        const from = new Date(Date.UTC(2026, 9, 11, 4, 0, 0));
        const next = getNextScheduledSyncDate(from);
        expect(next.toISOString()).toBe("2026-10-18T03:00:00.000Z");
    });

    it("schedules for tomorrow Sunday from Saturday night", () => {
        // Saturday 2026-10-10 23:59:00 UTC
        const from = new Date(Date.UTC(2026, 9, 10, 23, 59, 0));
        const next = getNextScheduledSyncDate(from);
        expect(next.toISOString()).toBe("2026-10-11T03:00:00.000Z");
    });
});

describe("syncMemberStudioRoles result details", () => {
    it("reports modified = true when adding missing roles", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Supervisor")],
            ["2", createMockDiscordRole("2", "Media Team")]
        ]);
        const memberRoles = new Map<string, DiscordRole>();
        const { member } = createMockMember("100", memberRoles, guildRoles);

        const result = await syncMemberStudioRoles(member, Role.Supervisor, [Specialty.MediaTeam]);
        expect(result.modified).toBe(true);
        expect(result.added).toEqual(["1", "2"]);
        expect(result.removed).toEqual([]);
    });

    it("reports modified = false when member roles already match", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Supervisor")]
        ]);
        const memberRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Supervisor")]
        ]);
        const { member } = createMockMember("100", memberRoles, guildRoles);

        const result = await syncMemberStudioRoles(member, Role.Supervisor, []);
        expect(result.modified).toBe(false);
        expect(result.added).toEqual([]);
        expect(result.removed).toEqual([]);
    });
});

describe("RoleReconciliationService", () => {
    it("reconciles drifted members and posts summary on scheduled runs with changes", async () => {
        const guildRoles = new Map<string, DiscordRole>([
            ["1", createMockDiscordRole("1", "Admin")],
            ["2", createMockDiscordRole("2", "Animators")]
        ]);

        const memberRoles = new Map<string, DiscordRole>();
        const { member } = createMockMember("111222333444555666", memberRoles, guildRoles);

        const mockGuild = {
            id: "guild-123",
            members: {
                fetch: vi.fn(async (id: string) => (id === "111222333444555666" ? member : null))
            }
        } as unknown as Guild;

        const sentMessages: unknown[] = [];
        const mockTelemetryChannel = {
            id: "channel-telemetry",
            isSendable: () => true,
            isDMBased: () => false,
            guildId: "guild-123",
            send: vi.fn(async (payload) => {
                sentMessages.push(payload);
            })
        } as unknown as TextChannel;

        const mockClient = {
            channels: {
                fetch: vi.fn(async (id: string) => (id === "channel-telemetry" ? mockTelemetryChannel : null))
            }
        } as unknown as Client;

        const mockApi = {
            listAllUsers: vi.fn(async () => [
                {
                    id: "user-1",
                    discordId: "111222333444555666",
                    role: Role.Admin,
                    specialties: []
                }
            ])
        } as unknown as PlatformApiClient;

        const mockProvisioner = {
            enforceRoleHierarchy: vi.fn(async () => 4)
        } as unknown as ServerProvisioner;

        const mockSettings = {
            channel: (purpose: ChannelPurpose) => (purpose === ChannelPurpose.Telemetry ? "channel-telemetry" : undefined)
        } as unknown as SettingsStore;

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        } as unknown as Logger;

        const service = new RoleReconciliationService(mockApi, mockProvisioner, mockSettings, mockClient, mockLogger);
        const summary = await service.reconcile(mockGuild, "scheduled");

        expect(summary.reorderedRoles).toBe(4);
        expect(summary.totalUsersChecked).toBe(1);
        expect(summary.driftedMembersSynced).toBe(1);
        expect(summary.errors).toEqual([]);
        expect(sentMessages.length).toBe(1);
    });

    it("remains silent when scheduled reconciliation finds 0 drifts and 0 reordered roles", async () => {
        const mockGuild = {
            id: "guild-123",
            members: {
                fetch: vi.fn(async () => null)
            }
        } as unknown as Guild;

        const sentMessages: unknown[] = [];
        const mockTelemetryChannel = {
            id: "channel-telemetry",
            isSendable: () => true,
            isDMBased: () => false,
            guildId: "guild-123",
            send: vi.fn(async (payload) => {
                sentMessages.push(payload);
            })
        } as unknown as TextChannel;

        const mockClient = {
            channels: {
                fetch: vi.fn(async () => mockTelemetryChannel)
            }
        } as unknown as Client;

        const mockApi = {
            listAllUsers: vi.fn(async () => [])
        } as unknown as PlatformApiClient;

        const mockProvisioner = {
            enforceRoleHierarchy: vi.fn(async () => 0)
        } as unknown as ServerProvisioner;

        const mockSettings = {
            channel: () => "channel-telemetry"
        } as unknown as SettingsStore;

        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        } as unknown as Logger;

        const service = new RoleReconciliationService(mockApi, mockProvisioner, mockSettings, mockClient, mockLogger);
        const summary = await service.reconcile(mockGuild, "scheduled");

        expect(summary.reorderedRoles).toBe(0);
        expect(summary.driftedMembersSynced).toBe(0);
        expect(sentMessages.length).toBe(0);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.objectContaining({ totalUsersChecked: 0 }),
            "scheduled role reconciliation clean, no drift detected"
        );
    });
});
