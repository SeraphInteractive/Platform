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
});
