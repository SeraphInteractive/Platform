import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { env, isSecureDeployment } from "./Environment";

function cookieName(base: string): string {
    return isSecureDeployment() ? `__Host-${base}` : base;
}

export const sessionCookieName = (): string => cookieName("platform_session");
export const verifierCookieName = (): string => cookieName("platform_pkce");

const tokenPattern = /^[A-Za-z0-9_\-.~+/=]{16,512}$/u;
const verifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/u;
const verifierTtlSeconds = 10 * 60;

export function readSessionToken(request: NextRequest): string | null {
    const value = request.cookies.get(sessionCookieName())?.value;
    return value !== undefined && tokenPattern.test(value) ? value : null;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date): void {
    response.cookies.set(sessionCookieName(), token, {
        httpOnly: true,
        secure: isSecureDeployment(),
        sameSite: "lax",
        path: "/",
        expires: expiresAt
    });
}

export function clearSessionCookie(response: NextResponse): void {
    response.cookies.set(sessionCookieName(), "", { httpOnly: true, secure: isSecureDeployment(), sameSite: "lax", path: "/", maxAge: 0 });
}

export function createPkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
    return { verifier, challenge };
}

export function setVerifierCookie(response: NextResponse, verifier: string): void {
    response.cookies.set(verifierCookieName(), verifier, {
        httpOnly: true,
        secure: isSecureDeployment(),
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
    response.cookies.set(verifierCookieName(), "", { httpOnly: true, secure: isSecureDeployment(), sameSite: "lax", path: "/", maxAge: 0 });
}

export function isSameOrigin(request: NextRequest): boolean {
    const origin = request.headers.get("origin");
    if (origin !== null) {
        return origin === request.nextUrl.origin || origin === env().WEB_APP_URL;
    }
    return request.headers.get("sec-fetch-site") === "same-origin";
}
