import { Role } from "@platform/contracts";
import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { assignRoleCommand } from "../../src/Commands/ModerationCommands.js";

// b9: missing rbac and discord permission checks on /assign-role
describe("b9: assignRoleCommand RBAC permission enforcement", () => {
    it("configures default_member_permissions on the slash command definition", () => {
        // slash command must restrict execution to users with ManageRoles permissions
        const permissions = assignRoleCommand.definition.default_member_permissions;
        expect(permissions).toBeDefined();

        const permsBigInt = BigInt(permissions ?? "0");
        expect(permsBigInt & PermissionFlagsBits.ManageRoles).toBe(PermissionFlagsBits.ManageRoles);
    });

    it("rejects unprivileged contributors from executing /assign-role", async () => {
        const mockTargetUser = { id: "target-user-1", username: "target", globalName: "Target" };
        const mockTargetMember = {
            id: mockTargetUser.id,
            user: mockTargetUser,
            roles: {
                cache: {
                    filter: vi.fn().mockReturnValue({ map: vi.fn().mockReturnValue({ filter: vi.fn().mockReturnValue([]) }) }),
                    some: vi.fn().mockReturnValue(false)
                },
                add: vi.fn().mockResolvedValue(undefined)
            }
        };

        const mockRole = {
            id: "role-animator-id",
            name: "Animators",
            members: new Map()
        };

        const mockGuild = {
            id: "guild-1",
            roles: {
                fetch: vi.fn().mockResolvedValue(mockRole)
            },
            members: {
                fetch: vi.fn().mockResolvedValue(mockTargetMember)
            }
        };

        const mockInteraction = {
            guild: mockGuild,
            user: { id: "contributor-user-id", username: "regular_contributor" },
            member: {
                id: "contributor-user-id",
                permissions: { has: vi.fn().mockReturnValue(false) }
            },
            options: {
                getRole: vi.fn().mockReturnValue(mockRole),
                getUser: vi.fn().mockReturnValue(mockTargetUser),
                getString: vi.fn().mockReturnValue("Promoting friend")
            },
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockApi = {
            as: vi.fn(),
            me: vi.fn().mockResolvedValue({ id: "contributor-user-id", role: Role.Contributor }),
            setRole: vi.fn().mockResolvedValue(undefined)
        };
        mockApi.as.mockReturnValue(mockApi);

        const mockContext = {
            api: mockApi,
            configuration: { guildId: "guild-1" }
        };

        // command must verify caller has supervisor or admin platform role before mutating access
        await expect(assignRoleCommand.execute(mockInteraction, mockContext as never)).rejects.toThrow(
            /supervisor|permission|unauthorized/i
        );

        // api.setRole must not be called by unprivileged users
        expect(mockApi.setRole).not.toHaveBeenCalled();
    });

    it("strips obsolete contributor roles when supervisor demotes user to voters", async () => {
        const mockTargetUser = { id: "target-user-1", username: "target", globalName: "Target" };
        const mockRoles = [
            { id: "role-voters-id", name: "Voters" },
            { id: "role-contributors-id", name: "General Contributors" },
            { id: "role-animators-id", name: "Animators" }
        ];

        const mockTargetRolesCache = new Map([
            ["role-contributors-id", mockRoles[1]],
            ["role-animators-id", mockRoles[2]]
        ]);

        const mockTargetMember = {
            id: mockTargetUser.id,
            user: mockTargetUser,
            roles: {
                cache: mockTargetRolesCache,
                add: vi.fn().mockResolvedValue(undefined),
                remove: vi.fn().mockResolvedValue(undefined)
            },
            guild: null as unknown
        };

        const mockGuild = {
            id: "guild-1",
            roles: {
                fetch: vi.fn(async (id?: string) => {
                    if (id) {
                        return mockRoles.find((r) => r.id === id) ?? null;
                    }
                    return new Map(mockRoles.map((r) => [r.id, r]));
                }),
                create: vi.fn()
            },
            members: {
                fetch: vi.fn().mockResolvedValue(mockTargetMember)
            }
        };
        mockTargetMember.guild = mockGuild;

        const mockInteraction = {
            guild: mockGuild,
            user: { id: "supervisor-id", username: "supervisor" },
            member: {
                id: "supervisor-id",
                permissions: { has: vi.fn().mockReturnValue(true) }
            },
            options: {
                getRole: vi.fn().mockReturnValue(mockRoles[0]), // Voters
                getUser: vi.fn().mockReturnValue(mockTargetUser),
                getString: vi.fn().mockReturnValue("Demoting to voter")
            },
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockApi = {
            as: vi.fn(),
            me: vi.fn().mockResolvedValue({ id: "supervisor-id", role: Role.Supervisor }),
            setRole: vi.fn().mockResolvedValue({ id: mockTargetUser.id, role: Role.Voter, specialties: [] })
        };
        mockApi.as.mockReturnValue(mockApi);

        const mockContext = {
            api: mockApi,
            configuration: { guildId: "guild-1" }
        };

        await assignRoleCommand.execute(mockInteraction, mockContext as never);

        // invariant: platform api must be called with Role.Voter and empty specialties
        expect(mockApi.setRole).toHaveBeenCalledWith(mockTargetUser.id, Role.Voter, [], "Target");

        // invariant: obsolete contributor and craft roles must be removed from the member
        expect(mockTargetMember.roles.remove).toHaveBeenCalledWith(
            expect.arrayContaining(["role-contributors-id", "role-animators-id"]),
            expect.any(String)
        );
    });
});
