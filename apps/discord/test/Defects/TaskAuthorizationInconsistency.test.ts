import { Role, ShotStatus, type ShotDetailDto } from "@platform/contracts";
import type { ChatInputCommandInteraction } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { releaseTaskCommand, submitTaskCommand } from "../../src/Commands/TaskCommands.js";

// b12: task submit and release authorization inconsistencies between discord bot and backend api
describe("b12: Task submit and release authorization inconsistencies", () => {
    const mockShot: ShotDetailDto = {
        id: "00000000-0000-0000-0000-000000000001",
        shotCode: "SC01_A1",
        title: "Hero Character Modeling",
        departmentId: "dept-assets",
        status: ShotStatus.Claimed,
        sequence: 1,
        cutOrder: 1,
        description: null,
        frameRange: null,
        deadlineAt: null,
        complexityScore: 1,
        difficultyTier: "tier1" as never,
        version: 1,
        claimer: {
            id: "claimant-user-id",
            discordId: "claimant-discord-id"
        },
        claimedAt: new Date().toISOString(),
        deliverables: [],
        reviewThreads: []
    } as unknown as ShotDetailDto;

    it("submitTaskCommand must attribute the claim to the actual claimant rather than the executing user", async () => {
        const supervisorDiscordId = "supervisor-discord-id";
        const claimantDiscordId = "claimant-discord-id";

        let capturedReplyContent = "";
        const mockInteraction = {
            user: { id: claimantDiscordId, username: "claimant_user" },
            options: {
                getString: vi.fn().mockReturnValue(mockShot.id)
            },
            channel: null,
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockImplementation((payload) => {
                // extract text content from the panel components
                capturedReplyContent = JSON.stringify(payload);
                return Promise.resolve(payload);
            })
        } as unknown as ChatInputCommandInteraction;

        const mockApi = {
            as: vi.fn(),
            me: vi.fn().mockResolvedValue({ id: "claimant-user-id", role: Role.Contributor }),
            getShot: vi.fn().mockResolvedValue(mockShot)
        };
        mockApi.as.mockReturnValue(mockApi);

        const mockContext = {
            api: mockApi,
            configuration: { webAppUrl: "https://platform.example.com" }
        };

        await submitTaskCommand.execute(mockInteraction, mockContext as never);

        // the rendered panel must display the actual task claimant's discord mention, never the executing supervisor
        expect(capturedReplyContent).toContain(`<@${claimantDiscordId}>`);
        expect(capturedReplyContent).not.toContain(`<@${supervisorDiscordId}>`);
    });

    it("submitTaskCommand must reject submissions from non-claimants to match backend assertActiveClaim invariant", async () => {
        const supervisorDiscordId = "supervisor-discord-id";

        const mockInteraction = {
            user: { id: supervisorDiscordId, username: "supervisor_lead" },
            options: {
                getString: vi.fn().mockReturnValue(mockShot.id)
            },
            channel: null,
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        const mockApi = {
            as: vi.fn(),
            // supervisor who did not claim this specific task
            me: vi.fn().mockResolvedValue({ id: "supervisor-user-id", role: Role.Supervisor }),
            getShot: vi.fn().mockResolvedValue(mockShot)
        };
        mockApi.as.mockReturnValue(mockApi);

        const mockContext = {
            api: mockApi,
            configuration: { webAppUrl: "https://platform.example.com" }
        };

        // backend strictly restricts submit to claimant only; bot must reject non-claimant supervisors
        await expect(submitTaskCommand.execute(mockInteraction, mockContext as never)).rejects.toThrow(
            /Only the contributor who claimed this task can submit/i
        );
    });

    it("releaseTaskCommand must enforce department supervisor authorization before calling releaseShot", async () => {
        const mockInteraction = {
            user: { id: "foreign-supervisor-discord-id", username: "animation_lead" },
            options: {
                getString: vi.fn().mockImplementation((opt: string) => {
                    if (opt === "task") {
                        return mockShot.id;
                    }
                    if (opt === "reason") {
                        return "Needs reassignment";
                    }
                    return null;
                })
            },
            channel: null,
            deferReply: vi.fn().mockResolvedValue(undefined),
            editReply: vi.fn().mockResolvedValue(undefined)
        } as unknown as ChatInputCommandInteraction;

        // backend rejects supervisors outside the task's assigned department
        const mockApi = {
            as: vi.fn(),
            me: vi.fn().mockResolvedValue({
                id: "foreign-supervisor-id",
                role: Role.Supervisor,
                departmentId: "dept-animation" // task belongs to dept-assets
            }),
            getShot: vi.fn().mockResolvedValue(mockShot),
            releaseShot: vi.fn().mockRejectedValue(new Error("UnauthorizedDepartment"))
        };
        mockApi.as.mockReturnValue(mockApi);

        const mockContext = {
            api: mockApi,
            configuration: { webAppUrl: "https://platform.example.com" }
        };

        // bot should check department authorization and provide a user-facing error rather than raw 403
        await expect(releaseTaskCommand.execute(mockInteraction, mockContext as never)).rejects.toThrow(/department supervisor/i);
        expect(mockApi.releaseShot).not.toHaveBeenCalled();
    });
});
