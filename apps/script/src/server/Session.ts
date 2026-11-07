import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const isProduction = process.env.NODE_ENV === "production";

function cookieName(base: string): string {
    return isProduction ? `__Host-${base}` : base;
}

export const sessionCookieName = (): string => cookieName("script_session");
export const verifierCookieName = (): string => cookieName("script_pkce");

const tokenPattern = /^[A-Za-z0-9_\-.~+/=]{16,512}$/u;
const verifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/u;
const verifierTtlSeconds = 10 * 60;

export function readSessionToken(request: NextRequest): string | null {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        if (tokenPattern.test(token)) return token;
    }
    const value =
        request.cookies.get(sessionCookieName())?.value ??
        request.cookies.get("__Host-platform_session")?.value ??
        request.cookies.get("platform_session")?.value ??
        request.cookies.get(cookieName("platform_session"))?.value ??
        request.cookies.get("mcs_auth_token")?.value;
    return value !== undefined && tokenPattern.test(value) ? value : null;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
    response.cookies.set(sessionCookieName(), token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        expires: expiresAt
    });
}

export function clearSessionCookie(response: NextResponse): void {
    response.cookies.set(sessionCookieName(), "", {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 0
    });
}

export function createPkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
    return { verifier, challenge };
}

export function setVerifierCookie(response: NextResponse, verifier: string): void {
    response.cookies.set(verifierCookieName(), verifier, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: verifierTtlSeconds
    });
}

export function readVerifier(request: NextRequest): string | null {
    const value = request.cookies.get(verifierCookieName())?.value;
    return value !== undefined && verifierPattern.test(value) ? value : null;
}

export function clearVerifierCookie(response: NextResponse): void {
    response.cookies.set(verifierCookieName(), "", {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 0
    });
}
