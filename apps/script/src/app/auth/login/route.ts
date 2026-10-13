import { type NextRequest, NextResponse } from "next/server";
import { createPkcePair, setVerifierCookie } from "@/server/Session";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://dev-api.seraphinteractive.com";
  const { verifier, challenge } = createPkcePair();

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3002";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const appOrigin = `${proto}://${host}`;

  const returnToParam = request.nextUrl.searchParams.get("returnTo") || "/";
  const callbackUrl = `${appOrigin}/auth/callback?returnTo=${encodeURIComponent(returnToParam)}`;

  const target = new URL("/api/v1/auth/discord", apiUrl);
  target.searchParams.set("codeChallenge", challenge);
  target.searchParams.set("returnTo", callbackUrl);

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  setVerifierCookie(response, verifier);
  return response;
}
