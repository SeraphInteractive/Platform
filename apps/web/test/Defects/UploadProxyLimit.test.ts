import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// mock server-only to allow importing server routes in node environment
vi.mock("server-only", () => ({}));

// ensure required environment variables exist for proxy tests
beforeAll(() => {
    process.env.WEB_APP_URL = "http://localhost:3000";
    process.env.API_INTERNAL_URL = "http://localhost:3333";
    process.env.API_PUBLIC_URL = "http://localhost:3333";
});

import { POST } from "@/app/api/v1/[...path]/route";

describe("b21 reproducer: upload proxy 50mb ceiling discrepancy", () => {
    const routeContext = {
        params: Promise.resolve({ path: ["uploads", "stream"] })
    };

    it("verifies small upload under 50mb is not rejected with 413 payload too large", async () => {
        // 1mb small payload
        const smallPayload = new Uint8Array(1024 * 1024);
        const req = new NextRequest("http://localhost:3000/api/v1/uploads/stream", {
            method: "POST",
            body: smallPayload,
            headers: {
                "content-type": "application/octet-stream",
                origin: "http://localhost:3000"
            }
        });

        const response = await POST(req, routeContext);
        // small payload should not trigger 413 (it returns 502 upstream unreachable in unit test)
        expect(response.status).not.toBe(413);
    });

    it("demonstrates b21 defect: 50mb limit rejects valid deliverables up to 2gb", async () => {
        // deliverables (.blend files, high-res renders) are allowed up to 2gb (deliverable_max_bytes in api)
        // when direct storage upload fails and client falls back to /api/v1/uploads/stream,
        // route.ts line 52 enforces an artificial 50mb limit (buffer.byteLength > 50 * 1024 * 1024)
        // test with a 51mb deliverable payload (51 * 1024 * 1024 bytes)
        const deliverablePayload = new Uint8Array(51 * 1024 * 1024);
        const req = new NextRequest("http://localhost:3000/api/v1/uploads/stream", {
            method: "POST",
            body: deliverablePayload,
            headers: {
                "content-type": "application/octet-stream",
                origin: "http://localhost:3000"
            }
        });

        const response = await POST(req, routeContext);
        const body = (await response.json()) as { code?: string; status?: number };

        // expected invariant: proxy should support deliverables exceeding 50mb without 413 payload_too_large
        // failing assertion against current code: route returns 413 payload_too_large
        expect(response.status).not.toBe(413);
        expect(body.code).not.toBe("PAYLOAD_TOO_LARGE");
    });
});
