import type { AutoModRuleDto } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, serviceToken, type TestContext } from "./Support/TestApplication.js";

describe("automod management", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    it("restricts rule creation and listing to admins and service token", async () => {
        const voter = await context.createUser(Role.Voter);
        const supervisor = await context.createUser(Role.Supervisor);
        const admin = await context.createUser(Role.Admin);

        // voter and supervisor cannot list
        expect((await context.application.inject({ method: "GET", url: "/api/v1/automod", headers: voter.headers })).statusCode).toBe(403);
        expect((await context.application.inject({ method: "GET", url: "/api/v1/automod", headers: supervisor.headers })).statusCode).toBe(
            403
        );

        // admin can list
        const adminList = await context.application.inject({ method: "GET", url: "/api/v1/automod", headers: admin.headers });
        expect(adminList.statusCode).toBe(200);

        // service token can list
        const serviceList = await context.application.inject({
            method: "GET",
            url: "/api/v1/automod",
            headers: { authorization: `Bearer ${serviceToken}` }
        });
        expect(serviceList.statusCode).toBe(200);

        // only admin can create rule
        const supervisorCreate = await context.application.inject({
            method: "POST",
            url: "/api/v1/automod",
            headers: supervisor.headers,
            payload: { pattern: "testbadword", isRegex: false }
        });
        expect(supervisorCreate.statusCode).toBe(403);

        const adminCreate = await context.application.inject({
            method: "POST",
            url: "/api/v1/automod",
            headers: admin.headers,
            payload: { pattern: "testbadword", isRegex: false }
        });
        expect(adminCreate.statusCode).toBe(201);
        const createdRule = json<{ data: AutoModRuleDto }>(adminCreate).data;
        expect(createdRule.pattern).toBe("testbadword");
        expect(createdRule.isRegex).toBe(false);

        // rejects invalid regex
        const invalidRegex = await context.application.inject({
            method: "POST",
            url: "/api/v1/automod",
            headers: admin.headers,
            payload: { pattern: "([a-z", isRegex: true }
        });
        expect(invalidRegex.statusCode).toBe(400);

        // accepts valid regex
        const validRegex = await context.application.inject({
            method: "POST",
            url: "/api/v1/automod",
            headers: admin.headers,
            payload: { pattern: "\\bscamlink\\b", isRegex: true }
        });
        expect(validRegex.statusCode).toBe(201);
        const createdRegexRule = json<{ data: AutoModRuleDto }>(validRegex).data;

        // admin can delete rule
        const deleteResponse = await context.application.inject({
            method: "DELETE",
            url: `/api/v1/automod/${createdRule.id}`,
            headers: admin.headers
        });
        expect(deleteResponse.statusCode).toBe(204);

        // clean up regex rule
        await context.application.inject({
            method: "DELETE",
            url: `/api/v1/automod/${createdRegexRule.id}`,
            headers: admin.headers
        });
    });
});
