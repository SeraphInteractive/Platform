import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { emailCodeLength, Role } from "@platform/contracts";
import {
    ApplicationError,
    BadRequestError,
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError
} from "../../Common/Errors/ApplicationError.js";
import type { AuthenticatedUser } from "../../Common/Security/Principal.js";
import { constantTimeEquals, hmacHex } from "../../Common/Security/Secrets.js";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import type { CaptchaVerifier } from "../../Infrastructure/Captcha/CaptchaVerifier.js";
import { isUniqueViolation, type Database } from "../../Infrastructure/Database/Database.js";
import { users, type UserRecord } from "../../Infrastructure/Database/Schema.js";
import type { EmailSender } from "../../Infrastructure/Email/EmailSender.js";
import type { MailDomainChecker } from "../../Infrastructure/Email/MailDomainChecker.js";
import { NotificationType, personOfUser, type Notifier } from "../../Infrastructure/Notifications/Notification.js";
import { isDisposableDomain, parseEmail } from "./EmailPolicy.js";

export const captchaAction = "verify-email";

const codeTtlSeconds = 15 * 60;
const resendCooldownSeconds = 60;
const maximumAttempts = 5;
const hourSeconds = 3600;
const daySeconds = 24 * hourSeconds;
const sendsPerUserHour = 5;
const sendsPerUserDay = 10;
const sendsPerAddressHour = 3;
const sendsPerAddressDay = 6;

interface PendingVerification {
    readonly emailHash: string;
    readonly codeHash: string;
    readonly expiresAt: string;
}

export interface StartedVerification {
    readonly expiresAt: Date;
    readonly resendAvailableAt: Date;
}

function tooManyRequests(message: string, retryAfterSeconds: number): ApplicationError {
    return new ApplicationError(429, ErrorCode.TooManyRequests, message, [], { "Retry-After": String(retryAfterSeconds) });
}

export class VerificationService {
    public constructor(
        private readonly database: Database,
        private readonly store: KeyValueStore,
        private readonly emailSender: EmailSender,
        private readonly captcha: CaptchaVerifier,
        private readonly mailDomains: MailDomainChecker,
        private readonly appKey: string,
        private readonly logger: FastifyBaseLogger,
        private readonly notifier?: Notifier
    ) {}

    public async start(user: AuthenticatedUser, email: string, captchaToken: string): Promise<StartedVerification> {
        await this.requireUnverified(user);
        if (!this.emailSender.isEnabled()) {
            throw new ServiceUnavailableError("Email verification is temporarily unavailable.");
        }
        const parsed = parseEmail(email);
        if (parsed === null) {
            throw new BadRequestError("Enter a valid email address.", ErrorCode.VerificationFailed);
        }
        if (!(await this.captcha.verify(captchaToken, captchaAction))) {
            throw new BadRequestError("The captcha check failed. Try again.", ErrorCode.VerificationFailed);
        }
        if (isDisposableDomain(parsed.domain) || !(await this.mailDomains.acceptsMail(parsed.domain))) {
            throw new BadRequestError("Use a permanent email address you can receive mail at.", ErrorCode.VerificationFailed);
        }
        if (!(await this.store.setIfAbsent(`verify:cooldown:${user.id}`, "1", resendCooldownSeconds))) {
            throw tooManyRequests("Wait a minute before requesting another code.", resendCooldownSeconds);
        }
        await this.limit(`verify:sends:user-hour:${user.id}`, hourSeconds, sendsPerUserHour);
        await this.limit(`verify:sends:user-day:${user.id}`, daySeconds, sendsPerUserDay);

        const emailHash = hmacHex(this.appKey, `verified-email:${parsed.canonical}`);
        const [holder] = await this.database.select({ id: users.id }).from(users).where(eq(users.verifiedEmailHash, emailHash)).limit(1);
        if (holder !== undefined) {
            throw new ConflictError("This email is already linked to another account.");
        }
        await this.limit(`verify:sends:address-hour:${emailHash}`, hourSeconds, sendsPerAddressHour);
        await this.limit(`verify:sends:address-day:${emailHash}`, daySeconds, sendsPerAddressDay);

        const code = randomInt(0, 10 ** emailCodeLength)
            .toString()
            .padStart(emailCodeLength, "0");
        const now = Date.now();
        const expiresAt = new Date(now + codeTtlSeconds * 1000);
        const pending: PendingVerification = {
            emailHash,
            codeHash: this.codeHash(user.id, emailHash, code),
            expiresAt: expiresAt.toISOString()
        };
        await this.store.delete(`verify:attempts:${user.id}`);
        await this.store.set(`verify:pending:${user.id}`, JSON.stringify(pending), codeTtlSeconds);

        try {
            await this.emailSender.send({
                to: parsed.address,
                subject: `Your verification code: ${code}`,
                text: `Your verification code is ${code}.\n\nIt expires in 15 minutes. If you didn't request this, ignore this email.`,
                html: `<p>Your verification code is</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;font-family:monospace">${code}</p><p>It expires in 15 minutes. If you didn't request this, ignore this email.</p>`,
                idempotencyKey: hmacHex(this.appKey, `verify-send:${user.id}:${pending.codeHash}`, 48)
            });
        } catch (error: unknown) {
            await this.store.delete(`verify:pending:${user.id}`);
            await this.store.delete(`verify:cooldown:${user.id}`);
            this.logger.error({ err: error }, "verification email failed");
            throw new ServiceUnavailableError("We couldn't send the email. Try again shortly.");
        }
        return { expiresAt, resendAvailableAt: new Date(now + resendCooldownSeconds * 1000) };
    }

    public async confirm(user: AuthenticatedUser, code: string): Promise<UserRecord> {
        await this.requireUnverified(user);
        const attempts = await this.store.incrementWithin(`verify:attempts:${user.id}`, codeTtlSeconds);
        if (attempts > maximumAttempts) {
            await this.store.delete(`verify:pending:${user.id}`);
            throw tooManyRequests("Too many incorrect codes. Request a new one.", resendCooldownSeconds);
        }
        const pending = this.parsePending(await this.store.get(`verify:pending:${user.id}`));
        if (pending === null || new Date(pending.expiresAt).getTime() <= Date.now()) {
            throw new BadRequestError("This code has expired. Request a new one.", ErrorCode.VerificationFailed);
        }
        if (!constantTimeEquals(this.codeHash(user.id, pending.emailHash, code), pending.codeHash)) {
            const remaining = maximumAttempts - attempts;
            throw new BadRequestError(
                remaining > 0
                    ? `That code is incorrect. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
                    : "That code is incorrect. Request a new one.",
                ErrorCode.VerificationFailed
            );
        }
        if ((await this.store.take(`verify:pending:${user.id}`)) === null) {
            throw new BadRequestError("This code has already been used.", ErrorCode.VerificationFailed);
        }
        await this.store.delete(`verify:attempts:${user.id}`);

        try {
            const [updated] = await this.database.transaction(async (transaction) => {
                const [current] = await transaction.select().from(users).where(eq(users.id, user.id)).limit(1).for("update");
                if (current === undefined) {
                    throw new NotFoundError("User");
                }
                return transaction
                    .update(users)
                    .set({
                        verifiedEmailHash: pending.emailHash,
                        emailVerifiedAt: new Date(),
                        role: current.role === Role.Member ? Role.Voter : current.role
                    })
                    .where(and(eq(users.id, user.id), isNull(users.emailVerifiedAt)))
                    .returning();
            });
            if (updated === undefined) {
                throw new ConflictError("Your account is already verified.");
            }
            if (updated.role !== user.role && this.notifier !== undefined) {
                this.notifier.notify({
                    type: NotificationType.UserRoleChanged,
                    user: personOfUser(updated),
                    role: updated.role,
                    specialties: updated.specialties,
                    actor: personOfUser(updated)
                });
            }
            return updated;
        } catch (error: unknown) {
            if (isUniqueViolation(error)) {
                throw new ConflictError("This email is already linked to another account.");
            }
            throw error;
        }
    }

    private async requireUnverified(user: AuthenticatedUser): Promise<void> {
        if (user.isBlacklisted) {
            throw new ForbiddenError("Your account can't be verified.", ErrorCode.UserBlacklisted);
        }
        const [record] = await this.database
            .select({ emailVerifiedAt: users.emailVerifiedAt })
            .from(users)
            .where(eq(users.id, user.id))
            .limit(1);
        if (record === undefined) {
            throw new NotFoundError("User");
        }
        if (record.emailVerifiedAt !== null) {
            throw new ConflictError("Your account is already verified.");
        }
    }

    private async limit(key: string, windowSeconds: number, maximum: number): Promise<void> {
        if ((await this.store.incrementWithin(key, windowSeconds)) > maximum) {
            throw tooManyRequests("Too many codes requested. Try again later.", windowSeconds);
        }
    }

    private codeHash(userId: string, emailHash: string, code: string): string {
        return hmacHex(this.appKey, `verify-code:${userId}:${emailHash}:${code}`);
    }

    private parsePending(value: string | null): PendingVerification | null {
        if (value === null) {
            return null;
        }
        try {
            const parsed = JSON.parse(value) as Partial<PendingVerification>;
            return typeof parsed.emailHash === "string" && typeof parsed.codeHash === "string" && typeof parsed.expiresAt === "string"
                ? { emailHash: parsed.emailHash, codeHash: parsed.codeHash, expiresAt: parsed.expiresAt }
                : null;
        } catch {
            return null;
        }
    }
}
