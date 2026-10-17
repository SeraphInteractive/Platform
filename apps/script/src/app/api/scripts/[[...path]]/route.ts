import { type NextRequest, NextResponse } from "next/server";
import { readSessionToken } from "@/server/Session";

export const dynamic = "force-dynamic";

interface RouteContext {
    readonly params: Promise<{ path?: string[] }>;
}

async function forward(request: NextRequest, context: RouteContext): Promise<NextResponse> {
    const { path } = await context.params;
    const subpath = path && path.length > 0 ? path.join("/") : "";
    const token = readSessionToken(request);
    if (!token) {
        return NextResponse.json({ error: "Unauthorized. Session expired or missing." }, { status: 401 });
    }

    const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "https://dev-api.projectstairway.net";
    const targetUrl = new URL(`/api/v1/scripts${subpath ? `/${subpath}` : ""}`, apiUrl);
    targetUrl.search = request.nextUrl.search;

    const method = request.method.toUpperCase();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`
    };
    const accept = request.headers.get("accept");
    if (accept) {
        headers["Accept"] = accept;
    }

    let body: string | undefined;
    if (method !== "GET" && method !== "HEAD") {
        const text = await request.text();
        if (text.length > 0) {
            body = text;
            headers["Content-Type"] = "application/json";
        }
    }

    try {
        const upstream = await fetch(targetUrl.toString(), {
            method,
            headers,
            body
        });

        const contentType = upstream.headers.get("content-type") ?? "";
        if (upstream.status === 204) {
            return new NextResponse(null, { status: 204 });
        }

        if (contentType.includes("text/event-stream")) {
            const streamHeaders = new Headers();
            streamHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
            streamHeaders.set("Cache-Control", "no-cache, no-transform");
            streamHeaders.set("Connection", "keep-alive");
            streamHeaders.set("X-Accel-Buffering", "no");
            return new NextResponse(upstream.body, { status: upstream.status, headers: streamHeaders });
        }

        if (contentType.includes("application/json")) {
            const data = await upstream.json().catch(() => ({}));
            return NextResponse.json(data, { status: upstream.status });
        }

        const raw = await upstream.text();
        return new NextResponse(raw, { status: upstream.status, headers: { "Content-Type": contentType } });
    } catch {
        return NextResponse.json({ error: "Upstream API unavailable." }, { status: 502 });
    }
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
