import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { banApologyCommand } from "../../src/Commands/ApologyReviewHandlers.js";
import { modStatusCommand, modStepDownButtonHandler } from "../../src/Commands/ModStatusCommands.js";

// b10: missing deferReply / deferUpdate before sequential REST calls triggers discord 10062 timeout
describe("b10: Discord interaction timeout prevention", () => {
    it("modStatusCommand must deferReply before sequential member and ban fetches", async () => {
        const targetUser = { id: "target-user-1", username: "target", tag: "target#0001" };
        const mockGuild = {
            id: "guild-1",
            members: {
                fetch: vi.fn().mockResolvedValue({
                    isCommunicationDisabled: () => false,
                    communicationDisabledUntilTimestamp: null
                })
            },
            bans: {
                fetch: vi.fn().mockResolvedValue(false)
            }
        };

        const deferReplyFn = vi.fn().mockResolvedValue(undefined);
        const mockInteraction = {
            guild: mockGuild,
            user: { id: "admin-user", username: "staff" },
            memberPermissions: {
                has: vi.fn().mockReturnValue(true)
            },
            options: {
                getUser: vi.fn().mockReturnValue(targetUser)
            },
            deferReply: deferReplyFn,
            reply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockContext = {
            warnings: {
                getRecord: vi.fn().mockReturnValue(undefined)
            },
            configuration: { guildId: "guild-1" }
        };

        await modStatusCommand.execute(mockInteraction, mockContext as never);

        // interaction must be acknowledged with deferReply within 3s window to prevent 10062 error
        expect(deferReplyFn).toHaveBeenCalled();
    });

    it("modStepDownButtonHandler must deferUpdate before network fetches and channel dispatch", async () => {
        const mockGuild = {
            id: "guild-1",
            members: {
                fetch: vi.fn().mockResolvedValue(null)
            },
            bans: {
                fetch: vi.fn().mockResolvedValue(false)
            }
        };

        const mockClient = {
            users: {
                fetch: vi.fn().mockResolvedValue(null)
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(null)
            }
        };

        const deferUpdateFn = vi.fn().mockResolvedValue(undefined);
        const mockInteraction = {
            guild: mockGuild,
            client: mockClient,
            user: { id: "admin-user", username: "staff" },
            customId: "mod_step_down:target-user-1",
            memberPermissions: {
                has: vi.fn().mockReturnValue(true)
            },
            deferUpdate: deferUpdateFn,
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ButtonInteraction;

        const mockContext = {
            warnings: {
                stepDownStage: vi.fn().mockReturnValue({ offenceLevel: 0, stageWarnings: 0, apology: { status: "none" }, infractions: [] }),
                getRecord: vi.fn().mockReturnValue({ offenceLevel: 0, stageWarnings: 0, apology: { status: "none" }, infractions: [] })
            },
            settings: {
                channel: vi.fn().mockReturnValue(undefined)
            },
            configuration: { guildId: "guild-1" }
        };

        await modStepDownButtonHandler.handle(mockInteraction, mockContext as never);

        // button interactions must call deferUpdate immediately before multi-step network operations
        expect(deferUpdateFn).toHaveBeenCalled();
    });

    it("banApologyCommand must deferReply before querying ban list", async () => {
        const mockGuild = {
            id: "guild-1",
            bans: {
                fetch: vi.fn().mockResolvedValue(true)
            }
        };

        const mockClient = {
            guilds: {
                cache: { get: vi.fn().mockReturnValue(mockGuild) },
                fetch: vi.fn().mockResolvedValue(mockGuild)
            }
        };

        const deferReplyFn = vi.fn().mockResolvedValue(undefined);
        const mockInteraction = {
            client: mockClient,
            user: { id: "banned-user", username: "banned_member" },
            options: {
                getString: vi.fn().mockReturnValue("I sincerely apologize and promise to follow rules.")
            },
            deferReply: deferReplyFn,
            reply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockContext = {
            warnings: {
                getRecord: vi.fn().mockReturnValue({ offenceLevel: 3, apology: { status: "none" } })
            },
            configuration: { guildId: "guild-1" }
        };

        await banApologyCommand.execute(mockInteraction, mockContext as never);

        // interaction must be deferred before checking bans to avoid 3s timeout
        expect(deferReplyFn).toHaveBeenCalled();
    });
});
