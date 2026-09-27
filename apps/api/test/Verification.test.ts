import { initialTermsVersion } from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { isDisposableDomain, parseEmail } from "../src/Modules/Verification/EmailPolicy.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";
import { passingCaptchaToken } from "./Support/TestDoubles.js";

describe("email policy", () => {
    it("canonicalises addresses so aliases share one identity", () => {
        expect(parseEmail(" J.Doe+votes@GoogleMail.com ")?.canonical).toBe("jdoe@gmail.com");
        expect(parseEmail("jane+x@example.org")?.canonical).toBe("jane@example.org");
        expect(parseEmail("not-an-email")).toBeNull();
        expect(parseEmail("+tag@example.org")).toBeNull();
    });

    it("rejects disposable domains and their subdomains", () => {
        expect(isDisposableDomain("mailinator.com")).toBe(true);
        expect(isDisposableDomain("x.yopmail.com")).toBe(true);
        expect(isDisposableDomain("proton.me")).toBe(false);
    });
});

describe("member verification", () => {
    let context: TestContext;

    beforeAll(async () => {
        context = await createTestContext();
    });

    afterAll(async () => {
        await context.close();
    });

    const send = (user: TestUser, email: string, captchaToken = passingCaptchaToken): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "POST",
            url: "/api/v1/verification/email",
            headers: user.headers,
            payload: { email, captchaToken }
        });

    const confirm = (user: TestUser, code: string): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "POST", url: "/api/v1/verification/email/confirm", headers: user.headers, payload: { code } });

    it("requires accepted terms before anything else", async () => {
        const member = await context.createUser(Role.Member, { termsVersion: null });
        expect((await send(member, "member@example.org")).statusCode).toBe(403);

        const stale = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/terms",
            headers: member.headers,
            payload: { version: "2000-01-01" }
        });
        expect(stale.statusCode).toBe(409);

        const accepted = await context.application.inject({
            method: "PUT",
            url: "/api/v1/users/me/terms",
            headers: member.headers,
            payload: { version: initialTermsVersion }
        });
        expect(json<{ data: { termsVersion: string } }>(accepted).data.termsVersion).toBe(initialTermsVersion);
    });

    it("stops members from voting or pitching until verified", async () => {
        const member = await context.createUser(Role.Member);
        const ballot = await context.application.inject({
            method: "PUT",
            url: "/api/v1/rounds/00000000-0000-4000-8000-000000000000/ballots/me",
            headers: member.headers,
            payload: { picks: ["00000000-0000-4000-8000-000000000001"] }
        });
        expect(ballot.statusCode).toBe(403);
        expect(json<{ code: string }>(ballot).code).toBe("VERIFICATION_REQUIRED");
    });

    it("rejects failed captchas, disposable and undeliverable addresses", async () => {
        const member = await context.createUser(Role.Member);
        expect((await send(member, "a@example.org", "wrong")).statusCode).toBe(400);
        expect((await send(member, "a@mailinator.com")).statusCode).toBe(400);
        expect((await send(member, "a@nowhere.invalid")).statusCode).toBe(400);
        expect(context.emailSender.messages).toHaveLength(0);
    });

    it("promotes a member to voter with the emailed code", async () => {
        const member = await context.createUser(Role.Member);
        expect((await send(member, "Real.Person@example.org")).statusCode).toBe(200);
        expect((await send(member, "Real.Person@example.org")).statusCode).toBe(429);

        const code = context.emailSender.lastCode();
        expect(code).not.toBeNull();
        expect(context.emailSender.messages.at(-1)?.to).toBe("real.person@example.org");

        const wrong = code === "000000" ? "111111" : "000000";
        expect((await confirm(member, wrong)).statusCode).toBe(400);

        const verified = await confirm(member, code ?? "");
        expect(verified.statusCode).toBe(200);
        expect(json<{ data: { role: string; isVerified: boolean } }>(verified).data).toMatchObject({ role: Role.Voter, isVerified: true });

        expect((await confirm(member, code ?? "")).statusCode).toBe(409);
    });

    it("never links one address to two accounts, including aliases", async () => {
        const first = await context.createUser(Role.Member);
        await send(first, "shared@example.org");
        expect((await confirm(first, context.emailSender.lastCode() ?? "")).statusCode).toBe(200);

        const second = await context.createUser(Role.Member);
        expect((await send(second, "shared+alt@example.org")).statusCode).toBe(409);
    });

    it("burns the code after too many wrong guesses", async () => {
        const member = await context.createUser(Role.Member);
        await send(member, "guesser@example.org");
        const code = context.emailSender.lastCode() ?? "";
        const wrong = code === "000000" ? "111111" : "000000";
        for (let attempt = 0; attempt < 5; attempt++) {
            expect((await confirm(member, wrong)).statusCode).toBe(400);
        }
        expect((await confirm(member, code)).statusCode).toBe(429);
        expect((await confirm(member, code)).statusCode).toBe(429);
    });

    it("does not let staff grant voter to an unverified member", async () => {
        const supervisor = await context.createUser(Role.Supervisor);
        const member = await context.createUser(Role.Member);
        const response = await context.application.inject({
            method: "PATCH",
            url: `/api/v1/users/${member.record.id}/role`,
            headers: supervisor.headers,
            payload: { role: Role.Voter }
        });
        expect(json<{ data: { role: string } }>(response).data.role).toBe(Role.Member);
    });
});
