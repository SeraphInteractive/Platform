import { dataEnvelope, sessionSchema, userSchema } from "@platform/contracts";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiFetch } from "@/Server/Upstream";
import { clearSessionCookie, clearVerifierCookie, isSameOrigin, readSessionToken, readVerifier, setSessionCookie } from "@/Server/Session";

export const dynamic = "force-dynamic";

const exchangeBody = z.object({ code: z.string().min(1).max(128) });

function problem(status: number, detail: string): NextResponse {
    return NextResponse.json(
        { type: "about:blank", title: "Login failed", status, detail, instance: "/api/session", code: "LOGIN_FAILED", traceId: "" },
        { status, headers: { "Cache-Control": "no-store" } }
    );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const headers = { "Cache-Control": "private, no-store" };
    const token = readSessionToken(request);
    if (token === null) {
        return NextResponse.json({ data: null }, { headers });
    }
    let upstream: Response;
    try {
        upstream = await apiFetch(request, "/api/v1/auth/me", { method: "GET", token });
    } catch {
        return problem(502, "The platform API is unreachable. Try again shortly.");
    }
    if (upstream.status === 401 || upstream.status === 404) {
        await upstream.body?.cancel();
        const response = NextResponse.json({ data: null }, { headers });
        clearSessionCookie(response);
        return response;
    }
    const payload: unknown = await upstream.json().catch(() => null);
    const user = dataEnvelope(userSchema).safeParse(payload);
    if (!upstream.ok || !user.success) {
        return problem(502, "Could not load your session.");
    }
    return NextResponse.json({ data: user.data.data }, { headers });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    if (!isSameOrigin(request)) {
        return problem(403, "Cross-origin request rejected.");
    }
    const verifier = readVerifier(request);
    if (verifier === null) {
        return problem(400, "Your login attempt expired. Start again.");
    }
    const parsedBody = exchangeBody.safeParse(await request.json().catch(() => null));
    if (!parsedBody.success) {
        return problem(400, "The login code is missing or malformed.");
    }

    const upstream = await apiFetch(request, "/api/v1/auth/token", {
        method: "POST",
        body: JSON.stringify({ code: parsedBody.data.code, codeVerifier: verifier })
    });
    const payload: unknown = await upstream.json().catch(() => null);
    const session = dataEnvelope(sessionSchema).safeParse(payload);
    if (!upstream.ok || !session.success) {
        const response = problem(upstream.status >= 400 && upstream.status < 500 ? 401 : 502, "Discord login could not be completed.");
        clearVerifierCookie(response);
        return response;
    }

    const response = NextResponse.json({ data: session.data.data.user }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(response, session.data.data.token, new Date(session.data.data.expiresAt));
    clearVerifierCookie(response);
    return response;
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
    if (!isSameOrigin(request)) {
        return problem(403, "Cross-origin request rejected.");
    }
    const token = readSessionToken(request);
    if (token !== null) {
        await apiFetch(request, "/api/v1/auth/session", { method: "DELETE", token }).catch(() => undefined);
    }
    const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    clearSessionCookie(response);
    return response;
}
