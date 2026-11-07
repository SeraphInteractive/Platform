import type { DiscordSettingsDto, UpdateDiscordSettingsDto } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("discord settings API", () => {
    let context: TestContext;
    let admin: TestUser;
    let voter: TestUser;
    const guildId = "100000000000000001";
    const serviceHeaders = { authorization: `Bearer ${serviceToken}` };

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        voter = await context.createUser(Role.Voter);
    });

    afterAll(async () => {
        await context.close();
    });

    it("rejects unauthorized and non-admin requests", async () => {
        const unauth = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/settings/${guildId}`
        });
        expect(unauth.statusCode).toBe(401);

        const forbidden = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/settings/${guildId}`,
            headers: voter.headers
        });
        expect(forbidden.statusCode).toBe(403);
    });

    it("returns default empty settings when not yet configured", async () => {
        const response = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/settings/${guildId}`,
            headers: serviceHeaders
        });
        expect(response.statusCode).toBe(200);
        const payload = json<{ data: DiscordSettingsDto }>(response).data;
        expect(payload.guildId).toBe(guildId);
        expect(payload.channels).toEqual({});
        expect(payload.roles).toEqual({});
        expect(payload.forumTags).toEqual({});
        expect(payload.notificationCursor).toBeNull();
        expect(payload.rulesMessageId).toBeNull();
    });

    it("upserts and retrieves settings via service token and admin", async () => {
        const updatePayload: UpdateDiscordSettingsDto = {
            channels: {
                welcome: "200000000000000001",
                telemetry: "200000000000000002"
            },
            roles: {
                member: "300000000000000001",
                voter: "300000000000000002"
            },
            forumTags: {
                available: "400000000000000001"
            },
            notificationCursor: "100-0",
            rulesMessageId: "500000000000000001"
        };

        const putResponse = await context.application.inject({
            method: "PUT",
            url: `/api/v1/discord/settings/${guildId}`,
            headers: serviceHeaders,
            payload: updatePayload
        });
        expect(putResponse.statusCode).toBe(200);
        const putData = json<{ data: DiscordSettingsDto }>(putResponse).data;
        expect(putData.channels.welcome).toBe("200000000000000001");
        expect(putData.notificationCursor).toBe("100-0");
        expect(putData.rulesMessageId).toBe("500000000000000001");

        // fetch with admin user headers
        const getResponse = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/settings/${guildId}`,
            headers: admin.headers
        });
        expect(getResponse.statusCode).toBe(200);
        const getData = json<{ data: DiscordSettingsDto }>(getResponse).data;
        expect(getData.channels.telemetry).toBe("200000000000000002");
        expect(getData.roles.voter).toBe("300000000000000002");
        expect(getData.forumTags.available).toBe("400000000000000001");
    });

    it("supports partial updates without wiping other fields", async () => {
        const updatePayload: UpdateDiscordSettingsDto = {
            notificationCursor: "105-0"
        };

        const putResponse = await context.application.inject({
            method: "PUT",
            url: `/api/v1/discord/settings/${guildId}`,
            headers: serviceHeaders,
            payload: updatePayload
        });
        expect(putResponse.statusCode).toBe(200);
        const putData = json<{ data: DiscordSettingsDto }>(putResponse).data;
        expect(putData.notificationCursor).toBe("105-0");
        expect(putData.channels.welcome).toBe("200000000000000001");
        expect(putData.rulesMessageId).toBe("500000000000000001");
    });
});
