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
        const mockFetch = vi.fn(async () => new Response(null, { status: 204 }));
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
                "https://discord.com/api/webhooks/test/anim-info",
                expect.objectContaining({
                    method: "POST"
                })
            );
        } finally {
            globalThis.fetch = globalFetch;
        }
    });
});
