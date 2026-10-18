import type { UpdateUserModerationRecordDto, UserModerationRecordDto } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("discord moderation API", () => {
    let context: TestContext;
    let supervisor: TestUser;
    let voter: TestUser;
    const testUserId = "900000000000000001";
    const serviceHeaders = { authorization: `Bearer ${serviceToken}` };

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
            method: "GET",
            url: `/api/v1/discord/moderation/${testUserId}`
        });
        expect(unauth.statusCode).toBe(401);

        const forbidden = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: voter.headers
        });
        expect(forbidden.statusCode).toBe(403);
    });

    it("returns default clean record when user has no moderation history", async () => {
        const response = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: serviceHeaders
        });
        expect(response.statusCode).toBe(200);
        const payload = json<{ data: UserModerationRecordDto }>(response).data;
        expect(payload.userId).toBe(testUserId);
        expect(payload.offenceLevel).toBe(0);
        expect(payload.stageWarnings).toBe(0);
        expect(payload.infractions).toEqual([]);
        expect(payload.timeouts).toEqual([]);
        expect(payload.apology.status).toBe("none");
    });

    it("upserts and retrieves moderation records via service token and supervisor", async () => {
        const updatePayload: UpdateUserModerationRecordDto = {
            offenceLevel: 1,
            stageWarnings: 2,
            infractions: [
                {
                    id: "inf1",
                    timestamp: "2026-10-18T12:00:00.000Z",
                    reason: "Profanity detected",
                    channelId: "200000000000000001",
                    messageSnippet: "bad words"
                }
            ],
            timeouts: [
                {
                    id: "to1",
                    timestamp: "2026-10-18T12:00:00.000Z",
                    durationMs: 86400000,
                    reason: "1st offence: 5 warnings reached",
                    level: 1
                }
            ],
            apology: {
                status: "pending",
                text: "I am sorry for my behaviour.",
                submittedAt: "2026-10-18T12:30:00.000Z",
                reviewedBy: null,
                reviewedAt: null
            }
        };

        const putResponse = await context.application.inject({
            method: "PUT",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: serviceHeaders,
            payload: updatePayload
        });
        expect(putResponse.statusCode).toBe(200);
        const putData = json<{ data: UserModerationRecordDto }>(putResponse).data;
        expect(putData.userId).toBe(testUserId);
        expect(putData.offenceLevel).toBe(1);
        expect(putData.stageWarnings).toBe(2);
        expect(putData.infractions).toHaveLength(1);
        expect(putData.timeouts).toHaveLength(1);
        expect(putData.apology.status).toBe("pending");
        expect(putData.apology.text).toBe("I am sorry for my behaviour.");

        // get with supervisor headers
        const getResponse = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: supervisor.headers
        });
        expect(getResponse.statusCode).toBe(200);
        const getData = json<{ data: UserModerationRecordDto }>(getResponse).data;
        expect(getData.userId).toBe(testUserId);
        expect(getData.apology.status).toBe("pending");
    });

    it("lists moderation records with query filters", async () => {
        const listResponse = await context.application.inject({
            method: "GET",
            url: "/api/v1/discord/moderation?offenceLevel=1&apologyStatus=pending",
            headers: supervisor.headers
        });
        expect(listResponse.statusCode).toBe(200);
        const listData = json<{ data: UserModerationRecordDto[] }>(listResponse).data;
        expect(listData.length).toBeGreaterThanOrEqual(1);
        expect(listData.some((r) => r.userId === testUserId)).toBe(true);

        const emptyList = await context.application.inject({
            method: "GET",
            url: "/api/v1/discord/moderation?offenceLevel=3",
            headers: supervisor.headers
        });
        expect(emptyList.statusCode).toBe(200);
        const emptyData = json<{ data: UserModerationRecordDto[] }>(emptyList).data;
        expect(emptyData.some((r) => r.userId === testUserId)).toBe(false);
    });

    it("resets and deletes user record with supervisor permissions", async () => {
        // voter cannot delete
        const forbiddenDelete = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: voter.headers
        });
        expect(forbiddenDelete.statusCode).toBe(403);

        // supervisor can delete
        const deleteResponse = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: supervisor.headers
        });
        expect(deleteResponse.statusCode).toBe(200);
        expect(json<{ data: { deleted: boolean } }>(deleteResponse).data.deleted).toBe(true);

        // getting now returns clean default
        const getAfter = await context.application.inject({
            method: "GET",
            url: `/api/v1/discord/moderation/${testUserId}`,
            headers: serviceHeaders
        });
        expect(getAfter.statusCode).toBe(200);
        const cleanData = json<{ data: UserModerationRecordDto }>(getAfter).data;
        expect(cleanData.offenceLevel).toBe(0);
        expect(cleanData.infractions).toEqual([]);
    });
});
