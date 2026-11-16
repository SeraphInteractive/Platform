import "server-only";
import type { NextRequest } from "next/server";
import { env } from "./Environment";

const upstreamTimeoutMs = 30_000;

interface UpstreamOptions {
    readonly method: string;
    readonly body?: BodyInit | null;
    readonly contentType?: string;
    readonly token?: string | null;
    readonly search?: string;
    readonly accept?: string;
    readonly signal?: AbortSignal;
    readonly timeout?: boolean;
}

export async function apiFetch(request: NextRequest, path: string, options: UpstreamOptions): Promise<Response> {
    const url = new URL(path, env().API_INTERNAL_URL);
    if (options.search !== undefined) {
        url.search = options.search;
    }
    const headers = new Headers({ Accept: options.accept ?? "application/json" });
    if (options.contentType !== undefined) {
        headers.set("Content-Type", options.contentType);
    } else if (options.body !== undefined && typeof options.body === "string") {
        headers.set("Content-Type", "application/json");
    }
    if (options.token !== undefined && options.token !== null) {
        headers.set("Authorization", `Bearer ${options.token}`);
    }
    const clientIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (clientIp !== null && /^[0-9a-fA-F.:]{1,45}$/u.test(clientIp)) {
        // append verified client ip to prevent rate limit bypasses via spoofed x-forwarded-for
        headers.set(
            "X-Forwarded-For",
            forwardedFor !== null && /^[0-9a-fA-F.:, ]{1,512}$/u.test(forwardedFor) ? `${forwardedFor}, ${clientIp}` : clientIp
        );
    } else if (forwardedFor !== null && /^[0-9a-fA-F.:, ]{1,512}$/u.test(forwardedFor)) {
        headers.set("X-Forwarded-For", forwardedFor);
    }
    const requestId = request.headers.get("x-request-id");
    if (requestId !== null && /^[A-Za-z0-9-]{8,64}$/u.test(requestId)) {
        headers.set("X-Request-Id", requestId);
    }

    const signals = [options.signal, options.timeout === false ? undefined : AbortSignal.timeout(upstreamTimeoutMs)].filter(
        (signal): signal is AbortSignal => signal !== undefined
    );
    const init: RequestInit = {
        method: options.method,
        headers,
        body: options.body,
        redirect: "manual",
        cache: "no-store",
        signal: signals.length === 0 ? undefined : AbortSignal.any(signals)
    };
    if (options.body !== undefined && options.body !== null && typeof options.body !== "string") {
        // duplex required by node fetch for streaming request bodies
        (init as Record<string, unknown>).duplex = "half";
    }
    return fetch(url, init);
}
