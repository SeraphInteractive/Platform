import type { AnnouncementPublishResultDto } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("announcements API", () => {
    let context: TestContext;
    let supervisor: TestUser;
    let voter: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);
        voter = await context.createUser(Role.Voter);
    });

    afterAll(async () => {
        await context.close();
    });

    it("rejects unauthorized and non-supervisor requests", async () => {
        const unauth = await context.application.inject({
            method: "POST",
            url: "/api/v1/announcements",
            payload: {
                target: "global",
                title: "Test",
                content: "Content"
            }
        });
        expect(unauth.statusCode).toBe(401);

        const forbidden = await context.application.inject({
            method: "POST",
            url: "/api/v1/announcements",
            headers: voter.headers,
            payload: {
                target: "global",
                title: "Test",
                content: "Content"
            }
        });
        expect(forbidden.statusCode).toBe(403);
    });

    it("returns 400 when global webhook is not configured in settings", async () => {
        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/announcements",
            headers: supervisor.headers,
            payload: {
                target: "global",
                title: "Global Milestone",
                content: "Milestone content here"
            }
        });
        expect(response.statusCode).toBe(400);
    });

    it("publishes to department webhook when configured", async () => {
        const globalFetch = globalThis.fetch;
        const mockFetch = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 204 }));
        globalThis.fetch = mockFetch;

        try {
            const depts = await context.application.inject({
                method: "GET",
                url: "/api/v1/departments"
            });
            const deptList = json<{ data: readonly { id: string; slug: string }[] }>(depts).data;
            const anim = deptList.find((d) => d.slug === "animation");
            expect(anim).toBeDefined();

            await context.application.inject({
                method: "PUT",
                url: `/api/v1/departments/${anim!.id}/discord-map`,
                headers: supervisor.headers,
                payload: {
                    discordCategoryId: "100000000000000010",
                    discordForumId: "100000000000000011",
                    discordChatChannelId: "100000000000000012",
                    discordInfoChannelId: "100000000000000013",
                    discordInfoWebhookUrl: "https://discord.com/api/webhooks/test/anim-info"
                }
            });

            const publish = await context.application.inject({
                method: "POST",
                url: "/api/v1/announcements",
                headers: supervisor.headers,
                payload: {
                    target: "department:animation",
                    title: "Animation Department Update",
                    content: "Please check your assigned shots."
                }
            });

            expect(publish.statusCode).toBe(200);
            const payload = json<{ data: AnnouncementPublishResultDto }>(publish).data;
            expect(payload.target).toBe("department:animation");
            expect(payload.dispatchedCount).toBe(1);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://discord.com/api/webhooks/test/anim-info?with_components=true",
                expect.objectContaining({
                    method: "POST"
                })
            );

            const publishWithPings = await context.application.inject({
                method: "POST",
                url: "/api/v1/announcements",
                headers: supervisor.headers,
                payload: {
                    target: "department:animation",
                    title: "Urgent Review Needed",
                    content: "Please check scene 3.",
                    pings: {
                        everyone: true,
                        roleIds: ["100000000000000014"],
                        userIds: ["100000000000000015"]
                    }
                }
            });

            expect(publishWithPings.statusCode).toBe(200);
            const lastCallArgs = mockFetch.mock.lastCall;
            expect(lastCallArgs).toBeDefined();
            const init = lastCallArgs?.[1];
            expect(typeof init?.body).toBe("string");
            const sentPayload = JSON.parse(init!.body as string) as {
                username?: string;
                avatar_url?: string;
                content?: string;
                components?: { type: number; content?: string }[];
                allowed_mentions?: { parse?: string[]; roles?: string[]; users?: string[] };
            };
            expect(sentPayload.username).toBe("Project Stairway");
            expect(sentPayload.avatar_url).toBeUndefined();
            expect(sentPayload.content).toBeUndefined();
            expect(sentPayload.components?.[0]?.content).toBe("@everyone <@&100000000000000014> <@100000000000000015>");
            expect(sentPayload.allowed_mentions?.parse).toContain("everyone");
            expect(sentPayload.allowed_mentions?.parse).not.toContain("roles");
            expect(sentPayload.allowed_mentions?.parse).not.toContain("users");
            expect(sentPayload.allowed_mentions?.roles).toContain("100000000000000014");
            expect(sentPayload.allowed_mentions?.users).toContain("100000000000000015");
        } finally {
            globalThis.fetch = globalFetch;
        }
    });

    it("returns 422 when all target webhooks fail to dispatch", async () => {
        const globalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("error from discord", { status: 400 }));

        try {
            const failedPublish = await context.application.inject({
                method: "POST",
                url: "/api/v1/announcements",
                headers: supervisor.headers,
                payload: {
                    target: "department:animation",
                    title: "Test Failure",
                    content: "This should fail with 422."
                }
            });

            expect(failedPublish.statusCode).toBe(422);
            const body = json<{ code: string; detail: string }>(failedPublish);
            expect(body.code).toBe("INTERNAL_ERROR");
            expect(body.detail).toContain("Failed to publish announcement to any channels");
        } finally {
            globalThis.fetch = globalFetch;
        }
    });
});
