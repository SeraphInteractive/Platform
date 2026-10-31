import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../../src/Domain/Roles.js";
import { createTestContext, type TestContext, type TestUser } from "../Support/TestApplication.js";

describe("ScriptsAdminRbac defect reproducer (B3)", () => {
    let context: TestContext;
    let member: TestUser;
    let supervisor: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        member = await context.createUser(Role.Member);
        supervisor = await context.createUser(Role.Supervisor);
    });

    afterAll(async () => {
        await context.close();
    });

    it("restricts listing screenplays strictly to administrators", async () => {
        // screenplay studio invariant requires admin or super_admin role
        const response = await context.application.inject({
            method: "GET",
            url: "/api/v1/scripts",
            headers: member.headers
        });

        // against current code, preHandler uses requireUser() instead of adminOrService, returning 200
        expect(response.statusCode).toBe(403);
    });

    it("restricts screenplay shelf management strictly to administrators", async () => {
        // supervisor role is not authorized for screenplay studio endpoints
        const listResponse = await context.application.inject({
            method: "GET",
            url: "/api/v1/scripts/shelves",
            headers: supervisor.headers
        });

        expect(listResponse.statusCode).toBe(403);

        const createResponse = await context.application.inject({
            method: "POST",
            url: "/api/v1/scripts/shelves",
            headers: member.headers,
            payload: { name: "Unauthorized Shelf" }
        });

        // against current code, preHandler allows regular members to create studio shelves, returning 201
        expect(createResponse.statusCode).toBe(403);
    });
});
