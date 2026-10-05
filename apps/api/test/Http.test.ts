import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, webOrigin, type TestContext } from "./Support/TestApplication.js";

describe("http contract", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    it("returns RFC 9457 problems for unknown routes and invalid input", async () => {
        const missing = await context.application.inject({ method: "GET", url: "/api/v1/nope" });
        expect(missing.statusCode).toBe(404);
        expect(missing.headers["content-type"]).toContain("application/problem+json");
        expect(json(missing)).toMatchObject({ status: 404, code: "ROUTE_NOT_FOUND" });

        const invalid = await context.application.inject({ method: "GET", url: "/api/v1/rounds/not-a-uuid" });
        expect(invalid.statusCode).toBe(400);
        const body = json<{ code: string; errors: { path: string }[]; traceId: string }>(invalid);
        expect(body.code).toBe("VALIDATION_FAILED");
        expect(body.errors[0]?.path).toContain("params");
        expect(body.traceId).toBe(invalid.headers["x-request-id"]);
    });

    it("rejects unexpected content types and oversized bodies", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const text = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: { ...supervisor.headers, "content-type": "text/plain" },
            payload: "title=x"
        });
        expect(text.statusCode).toBe(415);
        const huge = await context.application.inject({
            method: "POST",
            url: "/api/v1/rounds",
            headers: { ...supervisor.headers, "content-type": "application/json" },
            payload: JSON.stringify({ title: "x".repeat(100_000) })
        });
        expect(huge.statusCode).toBe(413);
    });

    it("sets hardened headers and a strict CORS policy", async () => {
        const allowed = await context.application.inject({ method: "GET", url: "/api/v1/rounds", headers: { origin: webOrigin } });
        expect(allowed.headers["access-control-allow-origin"]).toBe(webOrigin);
        expect(allowed.headers["access-control-allow-credentials"]).toBeUndefined();
        expect(allowed.headers["content-security-policy"]).toContain("default-src 'none'");
        expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
        expect(allowed.headers["ratelimit-limit"]).toBeDefined();

        const denied = await context.application.inject({ method: "GET", url: "/api/v1/rounds", headers: { origin: "https://evil.test" } });
        expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("ignores unsafe client request ids", async () => {
        const response = await context.application.inject({ method: "GET", url: "/health/live", headers: { "x-request-id": "bad\nid" } });
        expect(response.headers["x-request-id"]).not.toContain("\n");
        const kept = await context.application.inject({
            method: "GET",
            url: "/health/live",
            headers: { "x-request-id": "trace-12345678" }
        });
        expect(kept.headers["x-request-id"]).toBe("trace-12345678");
    });

    it("reports readiness and publishes an OpenAPI document", async () => {
        expect(json(await context.application.inject({ method: "GET", url: "/health/ready" }))).toEqual({ status: "ok" });
        const moderator = await context.createUser(Role.Moderator);
        const spec = await context.application.inject({ method: "GET", url: "/api/v1/openapi.json", headers: moderator.headers });
        expect(spec.statusCode).toBe(200);
        const document = json<{ openapi: string; paths: Record<string, unknown> }>(spec);
        expect(document.openapi).toBe("3.1.0");
        expect(Object.keys(document.paths)).toContain("/api/v1/rounds/{roundId}/ballots/me");
    });

    it("never exposes internal error details", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const response = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: { sceneNumber: 1, shotCode: "DUP", title: "a", difficultyTier: "easy" }
        });
        expect(response.statusCode).toBe(201);
        const duplicate = await context.application.inject({
            method: "POST",
            url: "/api/v1/shots",
            headers: supervisor.headers,
            payload: { sceneNumber: 1, shotCode: "DUP", title: "a", difficultyTier: "easy" }
        });
        expect(duplicate.statusCode).toBe(409);
        expect(duplicate.body).not.toMatch(/duplicate key|constraint|23505/u);
    });
});
