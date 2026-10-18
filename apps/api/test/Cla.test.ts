import { ageOfMajorityFor, ageOn, ClaStatus, GuardianRelationship } from "@platform/contracts";
import { eq, sql } from "drizzle-orm";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PiiCipher } from "../src/Common/Security/PiiCipher.js";
import { Role } from "../src/Domain/Roles.js";
import { claSignatures } from "../src/Infrastructure/Database/Schema.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";

function bornYearsAgo(years: number): string {
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    date.setUTCDate(date.getUTCDate() - 10);
    return date.toISOString().slice(0, 10);
}

interface Envelope<T> {
    readonly data: T;
}

interface Agreement {
    readonly id: string;
    readonly status: ClaStatus;
    readonly isMinor: boolean;
}

describe("age of majority", () => {
    it("uses the region where the age differs within a country", () => {
        expect(ageOfMajorityFor("US", "AL")).toBe(19);
        expect(ageOfMajorityFor("US", "MS")).toBe(21);
        expect(ageOfMajorityFor("US", "CA")).toBe(18);
        expect(ageOfMajorityFor("CA", "BC")).toBe(19);
        expect(ageOfMajorityFor("GB", "SCT")).toBe(16);
        expect(ageOfMajorityFor("US", null)).toBeNull();
        expect(ageOfMajorityFor("KR", null)).toBe(19);
        expect(ageOfMajorityFor("DE", null)).toBe(18);
        expect(ageOfMajorityFor("DE", "BY")).toBeNull();
        expect(ageOfMajorityFor("ZZ", null)).toBeNull();
    });

    it("counts birthdays in whole years", () => {
        const today = new Date(Date.UTC(2026, 9, 19));
        expect(ageOn("2008-10-19", today)).toBe(18);
        expect(ageOn("2008-10-20", today)).toBe(17);
        expect(ageOn("2008-02-30", today)).toBeNull();
    });
});

describe("pii cipher", () => {
    it("binds ciphertext to its context", () => {
        const cipher = new PiiCipher(undefined, "a-secret-that-is-long-enough-for-tests-0123");
        const sealed = cipher.encrypt({ name: "Jane" }, "cla:1:contributor");
        expect(sealed).not.toContain("Jane");
        expect(cipher.decrypt(sealed, "cla:1:contributor")).toEqual({ name: "Jane" });
        expect(() => cipher.decrypt(sealed, "cla:2:contributor")).toThrow();
    });
});

describe("contributor license agreement", () => {
    let context: TestContext;
    let admin: TestUser;
    let superAdmin: TestUser;

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        superAdmin = await context.createUser(Role.SuperAdmin);
    });

    afterAll(async () => {
        await context.close();
    });

    const sign = (user: TestUser, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "POST",
            url: "/api/v1/cla/me",
            headers: user.headers,
            payload: { revision: 1, accepted: true, country: "DE", region: null, guardian: null, ...payload }
        });

    const adult = { legalName: "Ada Lovelace", email: "ada@example.org", dateOfBirth: bornYearsAgo(30) };

    const minor = (guardianEmail: string, legalName = "Jamie Minor"): Record<string, unknown> => ({
        legalName,
        email: `${legalName.split(" ")[0]?.toLowerCase() ?? "minor"}@example.org`,
        dateOfBirth: bornYearsAgo(18),
        country: "US",
        region: "AL",
        guardian: { legalName: "Pat Guardian", relationship: GuardianRelationship.Parent, email: guardianEmail, phone: "+1 555 0100" }
    });

    const claim = (user: TestUser): Promise<LightMyRequestResponse> =>
        context.application.inject({
            method: "POST",
            url: "/api/v1/shots/00000000-0000-4000-8000-000000000000/claim",
            headers: user.headers
        });

    const lastToken = (): string => {
        const match = /\/cla\/guardian\/([A-Za-z0-9_-]{43})/u.exec(context.emailSender.messages.at(-1)?.text ?? "");
        if (match?.[1] === undefined) {
            throw new Error("no consent link was emailed");
        }
        return match[1];
    };

    const decide = (token: string, payload: Record<string, unknown>): Promise<LightMyRequestResponse> =>
        context.application.inject({ method: "POST", url: `/api/v1/cla/guardian/${token}`, payload });

    it("can't be signed before the agreement is published", async () => {
        const member = await context.createUser(Role.Member);
        expect((await sign(member, adult)).statusCode).toBe(409);
        const status = await context.application.inject({ method: "GET", url: "/api/v1/cla/me", headers: member.headers });
        expect(json<Envelope<{ document: { revision: number }; current: null }>>(status).data).toMatchObject({
            document: { revision: 0 },
            current: null
        });

        const published = await context.application.inject({
            method: "PUT",
            url: "/api/v1/documents/cla",
            headers: superAdmin.headers,
            payload: {
                title: "Contributor License Agreement",
                sections: [{ id: "grant", title: "Grant", html: "<p>You grant the project a licence.</p>" }],
                expectedRevision: 0
            }
        });
        expect(published.statusCode).toBe(200);
    });

    it("lets an adult sign, gates contributions until then and emails a receipt", async () => {
        const member = await context.createUser(Role.Member);
        const blocked = await claim(member);
        expect(blocked.statusCode).toBe(403);
        expect(json<{ code: string }>(blocked).code).toBe("CLA_REQUIRED");

        expect((await sign(member, { ...adult, revision: 2 })).statusCode).toBe(409);
        const signed = await sign(member, adult);
        expect(signed.statusCode).toBe(201);
        expect(json<Envelope<Agreement>>(signed).data).toMatchObject({ status: ClaStatus.Active, isMinor: false });
        expect((await sign(member, adult)).statusCode).toBe(409);

        expect((await claim(member)).statusCode).toBe(404);
        const receiptEmail = context.emailSender.messages.at(-1);
        expect(receiptEmail?.to).toBe("ada@example.org");
        expect(receiptEmail?.text).toContain("You grant the project a licence.");

        const [stored] = await context.database
            .select()
            .from(claSignatures)
            .where(eq(claSignatures.id, json<Envelope<Agreement>>(signed).data.id));
        expect(stored?.contributorPii).not.toBeNull();
        expect(stored?.contributorPii).not.toContain("Ada");
        expect(stored?.documentHash).toMatch(/^[0-9a-f]{64}$/u);

        const receipt = await context.application.inject({ method: "GET", url: "/api/v1/cla/me/receipt", headers: member.headers });
        expect(json<Envelope<{ contributor: { legalName: string }; document: { revision: number } }>>(receipt).data).toMatchObject({
            contributor: { legalName: "Ada Lovelace" },
            document: { revision: 1 }
        });
    });

    it("validates residence and age", async () => {
        const member = await context.createUser(Role.Member);
        expect((await sign(member, { ...adult, country: "US" })).statusCode).toBe(400);
        expect((await sign(member, { ...adult, country: "DE", region: "BY" })).statusCode).toBe(201);

        const child = await context.createUser(Role.Member);
        expect((await sign(child, { ...adult, dateOfBirth: bornYearsAgo(12) })).statusCode).toBe(422);

        const teen = await context.createUser(Role.Member);
        const missingGuardian = await sign(teen, { ...minor("p@example.org"), guardian: null });
        expect(missingGuardian.statusCode).toBe(422);
        expect(json<{ code: string }>(missingGuardian).code).toBe("GUARDIAN_REQUIRED");
        const sameEmail = await sign(teen, minor("jamie+parent@example.org"));
        expect(sameEmail.statusCode).toBe(422);
    });

    it("activates a minor's agreement only after the guardian consents", async () => {
        const teen = await context.createUser(Role.Member);
        const signed = await sign(teen, minor("guardian.one@example.org"));
        expect(signed.statusCode).toBe(201);
        const agreement = json<Envelope<Agreement>>(signed).data;
        expect(agreement).toMatchObject({ status: ClaStatus.PendingGuardian, isMinor: true });
        expect(context.emailSender.messages.at(-1)?.to).toBe("guardian.one@example.org");
        expect((await claim(teen)).statusCode).toBe(403);

        const token = lastToken();
        const review = await context.application.inject({ method: "GET", url: `/api/v1/cla/guardian/${token}` });
        expect(review.statusCode).toBe(200);
        expect(json<Envelope<{ contributor: { legalName: string }; guardian: { legalName: string } }>>(review).data).toMatchObject({
            contributor: { legalName: "Jamie Minor" },
            guardian: { legalName: "Pat Guardian" }
        });

        expect((await decide(token, { decision: "approve", legalName: "Pat Guardian", accepted: false })).statusCode).toBe(400);
        expect((await decide(token, { decision: "approve", legalName: "Someone Else", accepted: true })).statusCode).toBe(422);
        const sent = context.emailSender.messages.length;
        const approved = await decide(token, { decision: "approve", legalName: "  pat  guardian ", accepted: true });
        expect(approved.statusCode).toBe(200);
        expect(json<Envelope<{ status: ClaStatus; receipt: { guardian: { consentedAt: string | null } } }>>(approved).data).toMatchObject({
            status: ClaStatus.Active,
            receipt: { guardian: { consentedAt: expect.any(String) } }
        });
        expect(context.emailSender.messages.slice(sent).map((message) => message.to)).toEqual([
            "jamie@example.org",
            "guardian.one@example.org"
        ]);
        expect((await decide(token, { decision: "approve", legalName: "Pat Guardian", accepted: true })).statusCode).toBe(404);
        expect((await claim(teen)).statusCode).toBe(404);

        const trail = await context.application.inject({
            method: "GET",
            url: `/api/v1/cla/signatures/${agreement.id}/events`,
            headers: admin.headers
        });
        const events = json<Envelope<{ isIntact: boolean; events: { type: string }[] }>>(trail).data;
        expect(events.isIntact).toBe(true);
        expect(events.events.map((event) => event.type)).toEqual([
            "signed",
            "guardian_requested",
            "guardian_approved",
            "activated",
            "receipt_sent",
            "receipt_sent"
        ]);

        const log = await context.application.inject({
            method: "GET",
            url: `/api/v1/cla/access-log?signatureId=${agreement.id}`,
            headers: superAdmin.headers
        });
        const purposes = json<{ data: { purpose: string; accessorKind: string }[] }>(log).data.map((entry) => entry.purpose);
        expect(purposes).toContain("Guardian consent review");
        expect(purposes).toContain("Guardian decision");
        expect(
            (await context.application.inject({ method: "GET", url: "/api/v1/cla/access-log", headers: admin.headers })).statusCode
        ).toBe(403);
    });

    it("records a guardian's refusal and lets the contributor try again", async () => {
        const teen = await context.createUser(Role.Member);
        await sign(teen, minor("guardian.two@example.org", "Robin Minor"));
        const declined = await decide(lastToken(), { decision: "reject", legalName: "Pat Guardian" });
        expect(json<Envelope<{ status: ClaStatus; receipt: null }>>(declined).data).toEqual({
            status: ClaStatus.GuardianRejected,
            receipt: null
        });
        expect(context.emailSender.messages.at(-1)?.to).toBe("robin@example.org");

        const retried = await sign(teen, minor("guardian.three@example.org", "Robin Minor"));
        expect(json<Envelope<Agreement>>(retried).data.status).toBe(ClaStatus.PendingGuardian);
    });

    it("replaces a pending request when the contributor signs again", async () => {
        const teen = await context.createUser(Role.Member);
        const first = json<Envelope<Agreement>>(await sign(teen, minor("guardian.four@example.org", "Casey Minor"))).data;
        const staleToken = lastToken();
        const resent = await context.application.inject({ method: "POST", url: "/api/v1/cla/me/guardian/resend", headers: teen.headers });
        expect(resent.statusCode).toBe(200);
        expect(lastToken()).not.toBe(staleToken);
        expect(
            (await context.application.inject({ method: "POST", url: "/api/v1/cla/me/guardian/resend", headers: teen.headers })).statusCode
        ).toBe(429);

        await sign(teen, minor("guardian.five@example.org", "Casey Minor"));
        const [previous] = await context.database.select().from(claSignatures).where(eq(claSignatures.id, first.id));
        expect(previous?.status).toBe(ClaStatus.Superseded);
        expect(previous?.purgeAfter).not.toBeNull();
    });

    it("expires consent requests nobody answers", async () => {
        const teen = await context.createUser(Role.Member);
        const pending = json<Envelope<Agreement>>(await sign(teen, minor("guardian.six@example.org", "Drew Minor"))).data;
        const token = lastToken();
        expect(await context.services.claService.expirePending(new Date(Date.now() + 15 * 86_400_000))).toBeGreaterThanOrEqual(1);
        const [expired] = await context.database.select().from(claSignatures).where(eq(claSignatures.id, pending.id));
        expect(expired?.status).toBe(ClaStatus.GuardianExpired);
        expect((await context.application.inject({ method: "GET", url: `/api/v1/cla/guardian/${token}` })).statusCode).toBe(404);
    });

    it("revokes, then purges personal data once retention ends", async () => {
        const member = await context.createUser(Role.Member);
        const signed = json<Envelope<Agreement>>(await sign(member, { ...adult, email: "revoker@example.org" })).data;
        const revoked = await context.application.inject({
            method: "POST",
            url: "/api/v1/cla/me/revoke",
            headers: member.headers,
            payload: { reason: "Leaving the project" }
        });
        expect(json<Envelope<Agreement>>(revoked).data.status).toBe(ClaStatus.Revoked);
        expect((await claim(member)).statusCode).toBe(403);

        const reveal = (): Promise<LightMyRequestResponse> =>
            context.application.inject({
                method: "POST",
                url: `/api/v1/cla/signatures/${signed.id}/pii`,
                headers: admin.headers,
                payload: { reason: "Checking a revocation" }
            });
        expect(json<Envelope<{ contributor: { email: string } }>>(await reveal()).data.contributor.email).toBe("revoker@example.org");

        expect(await context.services.claService.purgeExpiredPii(new Date(Date.now() + 91 * 86_400_000))).toBeGreaterThanOrEqual(1);
        const [purged] = await context.database.select().from(claSignatures).where(eq(claSignatures.id, signed.id));
        expect(purged).toMatchObject({ contributorPii: null, revocationReason: null, status: ClaStatus.Revoked });
        expect(purged?.piiPurgedAt).not.toBeNull();
        expect((await reveal()).statusCode).toBe(409);

        const trail = await context.application.inject({
            method: "GET",
            url: `/api/v1/cla/signatures/${signed.id}/events`,
            headers: admin.headers
        });
        expect(json<Envelope<{ events: { type: string }[] }>>(trail).data.events.at(-1)?.type).toBe("pii_purged");
    });

    it("keeps staff tools to admins", async () => {
        const moderator = await context.createUser(Role.Moderator);
        expect(
            (await context.application.inject({ method: "GET", url: "/api/v1/cla/signatures", headers: moderator.headers })).statusCode
        ).toBe(403);
        const listed = await context.application.inject({ method: "GET", url: "/api/v1/cla/signatures", headers: admin.headers });
        expect(listed.statusCode).toBe(200);
        expect(listed.body).not.toContain("Ada Lovelace");
    });

    it("refuses to rewrite or delete audit records", async () => {
        const [signature] = await context.database.select().from(claSignatures).limit(1);
        expect(signature).toBeDefined();
        await expect(context.database.execute(sql`UPDATE cla_events SET hash = 'x'`)).rejects.toThrow();
        await expect(context.database.execute(sql`DELETE FROM cla_pii_access_log`)).rejects.toThrow();
        await expect(context.database.execute(sql`DELETE FROM cla_signatures`)).rejects.toThrow();
        await expect(
            context.database.execute(sql`UPDATE cla_signatures SET signed_at = now() WHERE id = ${signature?.id ?? ""}`)
        ).rejects.toThrow();
        await expect(
            context.database.execute(sql`UPDATE cla_signatures SET contributor_pii = 'v1.forged' WHERE id = ${signature?.id ?? ""}`)
        ).rejects.toThrow();
    });
});
