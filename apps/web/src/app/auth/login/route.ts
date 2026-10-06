import { type NextRequest, NextResponse } from "next/server";
import { safePathOr } from "@/Lib/SafePath";
import { env } from "@/Server/Environment";
import { createPkcePair, setVerifierCookie } from "@/Server/Session";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
    const { WEB_APP_URL, API_PUBLIC_URL, CORS_ORIGINS } = env();
    const returnTo = safePathOr(request.nextUrl.searchParams.get("returnTo"));
    const { verifier, challenge } = createPkcePair();

    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? (new URL(WEB_APP_URL).protocol.replace(":", ""));
    const currentOrigin = host !== null && host.length > 0 ? `${proto}://${host}` : WEB_APP_URL;
    const baseOrigin = CORS_ORIGINS.includes(currentOrigin) || currentOrigin === WEB_APP_URL ? currentOrigin : WEB_APP_URL;

    const target = new URL("/api/v1/auth/discord", API_PUBLIC_URL);
    target.searchParams.set("codeChallenge", challenge);
    target.searchParams.set("returnTo", `${baseOrigin}${returnTo}`);

    const response = NextResponse.redirect(target, 303);
    response.headers.set("Cache-Control", "no-store");
    setVerifierCookie(response, verifier);
    return response;
}
