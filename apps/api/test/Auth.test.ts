import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import {
    adminDiscordId,
    createTestContext,
    json,
    nextSnowflake,
    serviceToken,
    webOrigin,
    type TestContext
} from "./Support/TestApplication.js";

const cookieName = "__Host-platform_oauth_state";

interface LoginResult {
    readonly location: string;
    readonly fragment: URLSearchParams;
    readonly verifier: string;
}

describe("authentication", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    async function login(
        discordCode: string,
        returnTo?: string,
        tamper?: (state: string, cookie: string) => [string, string]
    ): Promise<LoginResult> {
        const verifier = randomBytes(32).toString("base64url");
        const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
        const start = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/discord",
            query: returnTo === undefined ? { codeChallenge } : { returnTo, codeChallenge }
        });
        expect(start.statusCode).toBe(302);
        const state = new URL(String(start.headers.location)).searchParams.get("state") ?? "";
        const cookie = start.cookies.find((item) => item.name === cookieName);
        expect(cookie?.httpOnly).toBe(true);
        expect(cookie?.secure).toBe(true);
        const [queryState, cookieValue] = tamper === undefined ? [state, cookie?.value ?? ""] : tamper(state, cookie?.value ?? "");

        const callback = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/discord/callback",
            query: { code: discordCode, state: queryState },
            cookies: { [cookieName]: cookieValue }
        });
        expect(callback.statusCode).toBe(302);
        const location = String(callback.headers.location);
        return { location, fragment: new URLSearchParams(location.split("#")[1] ?? ""), verifier };
    }

    it("completes the Discord login and issues a bearer token through a one-time code", async () => {
        const discordId = nextSnowflake();
        context.discord.register("good-code", { id: discordId, username: "Alice", avatar: null });

        const { location, fragment, verifier } = await login("good-code", "/rounds/42");
        expect(location.startsWith(`${webOrigin}/auth/callback#`)).toBe(true);
        expect(location).not.toContain("?token=");
        expect(fragment.get("returnTo")).toBe("/rounds/42");

        const exchange = await context.application.inject({
            method: "POST",
            url: "/api/v1/auth/token",
            payload: { code: fragment.get("code"), codeVerifier: verifier }
        });
        expect(exchange.statusCode).toBe(200);
        const session = json<{ data: { token: string; user: { discordId: string; role: string } } }>(exchange).data;
        expect(session.user.discordId).toBe(discordId);
        expect(session.user.role).toBe(Role.Member);

        const me = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: { authorization: `Bearer ${session.token}` }
        });
        expect(me.statusCode).toBe(200);

        const replay = await context.application.inject({
            method: "POST",
            url: "/api/v1/auth/token",
            payload: { code: fragment.get("code"), codeVerifier: verifier }
        });
        expect(replay.statusCode).toBe(400);
        expect(json(replay).code).toBe("INVALID_LOGIN_CODE");

        const logout = await context.application.inject({
            method: "DELETE",
            url: "/api/v1/auth/session",
            headers: { authorization: `Bearer ${session.token}` }
        });
        expect(logout.statusCode).toBe(204);
        const afterLogout = await context.application.inject({
            method: "GET",
            url: "/api/v1/auth/me",
            headers: { authorization: `Bearer ${session.token}` }
        });
        expect(afterLogout.statusCode).toBe(401);
    });

    it("never redirects to an origin outside the allowlist", async () => {
        context.discord.register("redirect-code", { id: nextSnowflake(), username: "Bob", avatar: null });
        for (const target of [
            "https://evil.test/steal",
            "//evil.test/x",
            "/\\evil.test",
            "javascript:alert(1)",
            "https://app.example.test.evil.test/",
            "https://app.example.test//evil.test/x",
            "/%2F%2Fevil.test"
        ]) {
            const { location } = await login("redirect-code", target);
            expect(new URL(location).origin).toBe(webOrigin);
            expect(new URLSearchParams(location.split("#")[1]).get("returnTo") ?? "/").toBe("/");
        }
        const { location } = await login("redirect-code", "https://preview.example.test/rounds?x=1");
        expect(location.startsWith("https://preview.example.test/auth/callback#")).toBe(true);
    });

    it("binds the login code to the browser that started the login", async () => {
        context.discord.register("attacker-code", { id: nextSnowflake(), username: "Attacker", avatar: null });
        const attacker = await login("attacker-code");
        const victim = await login("attacker-code");
        const planted = await context.application.inject({
            method: "POST",
            url: "/api/v1/auth/token",
            payload: { code: attacker.fragment.get("code"), codeVerifier: victim.verifier }
        });
        expect(planted.statusCode).toBe(400);
        const missingChallenge = await context.application.inject({ method: "GET", url: "/api/v1/auth/discord" });
        expect(missingChallenge.statusCode).toBe(400);
    });

    it("rejects callbacks without a matching state cookie", async () => {
        context.discord.register("csrf-code", { id: nextSnowflake(), username: "Mallory", avatar: null });
        const { fragment } = await login("csrf-code", undefined, (state) => [state, "forged-cookie-value-that-does-not-match-it"]);
        expect(fragment.get("error")).toBe("invalid_state");
        expect(fragment.get("code")).toBeNull();
    });

    it("does not leak Discord error details into the redirect", async () => {
        const { fragment } = await login("unknown-code");
        expect(fragment.get("error")).toBe("authentication_failed");
    });

    it("elevates configured administrators on login and never downgrades roles", async () => {
        context.discord.register("admin-code", { id: adminDiscordId, username: "Root", avatar: null });
        const { fragment, verifier } = await login("admin-code");
        const exchange = await context.application.inject({
            method: "POST",
            url: "/api/v1/auth/token",
            payload: { code: fragment.get("code"), codeVerifier: verifier }
        });
        expect(json<{ data: { user: { role: string } } }>(exchange).data.user.role).toBe(Role.Admin);
    });

    it("keeps roles granted in the app when the user logs in again", async () => {
        const discordId = nextSnowflake();
        const existing = await context.createUser(Role.Contributor, { discordId });
        context.discord.register("returning-code", { id: discordId, username: "Returning", avatar: null });
        const { fragment, verifier } = await login("returning-code");
        const exchange = await context.application.inject({
            method: "POST",
            url: "/api/v1/auth/token",
            payload: { code: fragment.get("code"), codeVerifier: verifier }
        });
        expect(json<{ data: { user: { id: string; role: string } } }>(exchange).data.user).toMatchObject({
            id: existing.record.id,
            role: Role.Contributor
        });
    });

    it("rejects malformed and unknown bearer tokens", async () => {
        for (const authorization of ["Bearer nope", "Basic abc", `Bearer plt_${"a".repeat(43)}`]) {
            const response = await context.application.inject({ method: "GET", url: "/api/v1/rounds", headers: { authorization } });
            expect(response.statusCode).toBe(401);
            expect(response.headers["content-type"]).toContain("application/problem+json");
        }
    });

    it("accepts the service token only where service access is granted", async () => {
        const headers = { authorization: `Bearer ${serviceToken}` };
        const me = await context.application.inject({ method: "GET", url: "/api/v1/auth/me", headers });
        expect(me.statusCode).toBe(403);
        const terms = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/terms",
            headers,
            payload: { version: "2026-09-27" }
        });
        expect(terms.statusCode).toBe(403);
    });
});
