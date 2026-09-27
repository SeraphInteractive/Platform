import { type NextRequest, NextResponse } from "next/server";
import { safePathOr } from "@/Lib/SafePath";
import { env } from "@/Server/Environment";
import { createPkcePair, setVerifierCookie } from "@/Server/Session";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
    const { WEB_APP_URL, API_PUBLIC_URL } = env();
    const returnTo = safePathOr(request.nextUrl.searchParams.get("returnTo"));
    const { verifier, challenge } = createPkcePair();

    const target = new URL("/api/v1/auth/discord", API_PUBLIC_URL);
    target.searchParams.set("codeChallenge", challenge);
    target.searchParams.set("returnTo", `${WEB_APP_URL}${returnTo}`);

    const response = NextResponse.redirect(target, 303);
    response.headers.set("Cache-Control", "no-store");
    setVerifierCookie(response, verifier);
    return response;
}
