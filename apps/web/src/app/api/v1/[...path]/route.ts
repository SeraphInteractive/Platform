import { type NextRequest, NextResponse } from "next/server";
import { isProxyablePath } from "@/Server/ProxyPolicy";
import { apiFetch } from "@/Server/Upstream";
import { clearSessionCookie, isSameOrigin, readSessionToken } from "@/Server/Session";

export const dynamic = "force-dynamic";

interface RouteContext {
    readonly params: Promise<{ path: string[] }>;
}

const maximumBodyBytes = 64 * 1024;
const maximumQueryLength = 2048;
const forwardedResponseHeaders = [
    "content-type",
    "cache-control",
    "retry-after",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
    "x-request-id"
];

function problem(status: number, code: string, detail: string): NextResponse {
    return NextResponse.json(
        { type: "about:blank", title: "Request rejected", status, detail, instance: "", code, traceId: "" },
        { status, headers: { "Cache-Control": "no-store" } }
    );
}

async function forward(request: NextRequest, context: RouteContext): Promise<NextResponse> {
    const { path } = await context.params;
    if (!isProxyablePath(path)) {
        return problem(404, "NOT_FOUND", "No such endpoint.");
    }
    if (request.nextUrl.search.length > maximumQueryLength) {
        return problem(414, "URI_TOO_LONG", "The query string is too long.");
    }

    const method = request.method.toUpperCase();
    const isMutation = method !== "GET" && method !== "HEAD";
    let body: string | undefined;
    if (isMutation) {
        if (!isSameOrigin(request)) {
            return problem(403, "FORBIDDEN", "Cross-origin request rejected.");
        }
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > maximumBodyBytes) {
            return problem(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
        }
        if (text.length > 0) {
            const contentType = request.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().startsWith("application/json")) {
                return problem(415, "UNSUPPORTED_MEDIA_TYPE", "Send JSON.");
            }
            body = text;
        }
    }

    const token = readSessionToken(request);
    const accept = request.headers.get("accept") === "text/event-stream" ? "text/event-stream" : "application/json";
    const send = (bearer: string | null): Promise<Response> =>
        apiFetch(request, `/api/v1/${path.join("/")}`, {
            method,
            body,
            token: bearer,
            search: request.nextUrl.search,
            accept,
            signal: request.signal,
            timeout: accept !== "text/event-stream"
        });
    let upstream: Response;
    let retriedAnonymously = false;
    try {
        upstream = await send(token);
        if (upstream.status === 401 && token !== null && !isMutation) {
            await upstream.body?.cancel();
            upstream = await send(null);
            retriedAnonymously = true;
        }
    } catch {
        return problem(502, "UPSTREAM_UNAVAILABLE", "The platform API is unreachable. Try again shortly.");
    }

    if (upstream.status >= 300 && upstream.status < 400) {
        return problem(502, "UPSTREAM_REDIRECT", "The platform API returned an unexpected redirect.");
    }

    const headers = new Headers();
    for (const name of forwardedResponseHeaders) {
        const value = upstream.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }
    if (!headers.has("cache-control")) {
        headers.set("Cache-Control", "private, no-store");
    }
    const response = new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers });
    if (token !== null && (upstream.status === 401 || retriedAnonymously)) {
        clearSessionCookie(response);
    }
    return response;
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
