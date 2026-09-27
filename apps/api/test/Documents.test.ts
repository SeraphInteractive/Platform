import { DocumentSlug } from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { sanitizeDocumentHtml } from "../src/Modules/Documents/DocumentSanitizer.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("document sanitizer", () => {
    it("keeps formatting and strips anything executable", () => {
        expect(sanitizeDocumentHtml("<p><strong>Hi</strong><script>alert(1)</script></p>")).toBe("<p><strong>Hi</strong></p>");
        expect(sanitizeDocumentHtml('<p onclick="x()">a</p><img src=x onerror=alert(1)>')).toBe("<p>a</p>");
        expect(sanitizeDocumentHtml('<a href="javascript:alert(1)">x</a>')).toBe("x");
        expect(sanitizeDocumentHtml('<a href="//evil.example">x</a>')).toBe("x");
        expect(sanitizeDocumentHtml('<a href="/grabbox">x</a>')).toBe('<a href="/grabbox">x</a>');
        expect(sanitizeDocumentHtml('<a href="https://example.org">x</a>')).toBe(
            '<a href="https://example.org" target="_blank" rel="noopener noreferrer nofollow">x</a>'
        );
    });
});

describe("documents", () => {
    let context: TestContext;
    let superAdmin: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        superAdmin = await context.createUser(Role.SuperAdmin);
    });

    afterAll(async () => {
        await context.close();
    });

    const publish = (user: TestUser, slug: DocumentSlug, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "PUT", url: `/api/v1/documents/${slug}`, headers: user.headers, payload });

    const body = {
        title: "Guidelines",
        sections: [{ id: "intro", title: "Intro", html: "<p>Hello<script>x</script></p>" }],
        expectedRevision: 0
    };

    it("serves defaults to anyone before the first publish", async () => {
        const response = await context.application.inject({ method: "GET", url: "/api/v1/documents/terms" });
        expect(response.statusCode).toBe(200);
        expect(json<{ data: { revision: number; sections: unknown[] } }>(response).data.revision).toBe(0);
    });

    it("only lets super admins publish", async () => {
        const admin = await context.createUser(Role.Admin);
        expect((await publish(admin, DocumentSlug.Guidelines, body)).statusCode).toBe(403);
    });

    it("publishes sanitized revisions and rejects stale edits", async () => {
        const first = await publish(superAdmin, DocumentSlug.Guidelines, body);
        expect(first.statusCode).toBe(200);
        expect(json<{ data: { revision: number; sections: { html: string }[] } }>(first).data).toMatchObject({
            revision: 1,
            sections: [{ html: "<p>Hello</p>" }]
        });
        expect((await publish(superAdmin, DocumentSlug.Guidelines, body)).statusCode).toBe(409);

        const revisions = await context.application.inject({
            method: "GET",
            url: "/api/v1/documents/guidelines/revisions",
            headers: superAdmin.headers
        });
        expect(json<{ data: { revision: number }[] }>(revisions).data.map((item) => item.revision)).toEqual([1]);
    });

    it("rejects duplicate section anchors", async () => {
        const duplicate = {
            ...body,
            expectedRevision: 0,
            sections: [
                { id: "a", title: "A", html: "" },
                { id: "a", title: "B", html: "" }
            ]
        };
        expect((await publish(superAdmin, DocumentSlug.Privacy, duplicate)).statusCode).toBe(400);
    });

    it("makes everyone re-accept when a legal change requires it", async () => {
        const voter = await context.createUser(Role.Voter);
        const published = await publish(superAdmin, DocumentSlug.Terms, {
            ...body,
            title: "Terms",
            requireReacceptance: true
        });
        expect(published.statusCode).toBe(200);

        const ballot = await context.application.inject({
            method: "PUT",
            url: "/api/v1/rounds/00000000-0000-4000-8000-000000000000/ballots/me",
            headers: voter.headers,
            payload: { picks: ["00000000-0000-4000-8000-000000000001"] }
        });
        expect(json<{ code: string }>(ballot).code).toBe("TERMS_NOT_ACCEPTED");

        const acceptance = await context.application.inject({ method: "GET", url: "/api/v1/legal/acceptance" });
        const { version } = json<{ data: { version: string } }>(acceptance).data;
        const accepted = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/terms",
            headers: voter.headers,
            payload: { version }
        });
        expect(json<{ data: { termsVersion: string } }>(accepted).data.termsVersion).toBe(version);
    });

    it("does not let guidelines demand re-acceptance", async () => {
        const response = await publish(superAdmin, DocumentSlug.Guidelines, { ...body, expectedRevision: 1, requireReacceptance: true });
        expect(response.statusCode).toBe(400);
    });
});
