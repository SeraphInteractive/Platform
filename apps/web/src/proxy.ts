import { type NextRequest, NextResponse } from "next/server";
import { env, isSecureDeployment } from "@/Server/Environment";

const turnstileOrigin = "https://challenges.cloudflare.com";
const youtubeOrigins = "https://www.youtube.com https://www.youtube-nocookie.com";

function contentSecurityPolicy(nonce: string): string {
    const { NODE_ENV, STORAGE_ORIGINS } = env();
    const isDevelopment = NODE_ENV === "development";
    const storage = STORAGE_ORIGINS.join(" ");
    const directives = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${turnstileOrigin}${isDevelopment ? " 'unsafe-eval'" : ""}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob: https://cdn.discordapp.com ${storage}`,
        `media-src 'self' blob: ${storage}`,
        `connect-src 'self' ${storage} ${turnstileOrigin}${isDevelopment ? " ws:" : ""}`,
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        `frame-src ${turnstileOrigin} ${youtubeOrigins}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'"
    ];
    if (isSecureDeployment()) {
        directives.push("upgrade-insecure-requests");
    }
    return directives.map((directive) => directive.trim()).join("; ");
}

export function proxy(request: NextRequest): NextResponse {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const policy = contentSecurityPolicy(nonce);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", policy);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", policy);
    return response;
}

export const config = {
    matcher: [
        {
            source: "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
            missing: [
                { type: "header", key: "next-router-prefetch" },
                { type: "header", key: "purpose", value: "prefetch" }
            ]
        }
    ]
};
