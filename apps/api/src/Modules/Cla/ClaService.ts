import { randomUUID } from "node:crypto";
import {
    ageOfMajorityFor,
    ageOn,
    ClaActorKind,
    ClaEventType,
    ClaStatus,
    DocumentSlug,
    GuardianDecision,
    guardianConsentDays,
    minimumClaAge,
    openClaStatuses,
    regionsOf,
    type ClaPiiDto,
    type ClaReceiptDto,
    type GuardianRelationship,
    type GuardianReviewDto
} from "@platform/contracts";
import { and, asc, count, desc, eq, inArray, isNull, lte, notInArray, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import {
    ApplicationError,
    BadRequestError,
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    UnprocessableError
} from "../../Common/Errors/ApplicationError.js";
import { createPage, offsetOf, type Page, type PaginationQuery } from "../../Common/Http/Schemas.js";
import type { PiiCipher } from "../../Common/Security/PiiCipher.js";
import type { AuthenticatedUser, UserActor } from "../../Common/Security/Principal.js";
import { generateSecret, hmacHex, sha256Hex } from "../../Common/Security/Secrets.js";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";
import { isUniqueViolation, type Database, type DatabaseExecutor } from "../../Infrastructure/Database/Database.js";
import {
    claEvents,
    claPiiAccessLog,
    claSignatures,
    entries,
    submissions,
    users,
    type ClaEventRecord,
    type ClaPiiAccessLogRecord,
    type ClaSignatureRecord,
    type StoredDocumentSection,
    type UserRecord
} from "../../Infrastructure/Database/Schema.js";
import type { EmailSender } from "../../Infrastructure/Email/EmailSender.js";
import type { MailDomainChecker } from "../../Infrastructure/Email/MailDomainChecker.js";
import type { DocumentsService } from "../Documents/DocumentsService.js";
import { isDisposableDomain, parseEmail, type ParsedEmail } from "../Verification/EmailPolicy.js";
import { ClaAuditTrail, canonicalJson } from "./ClaAuditTrail.js";
import { guardianDeclinedEmail, guardianRequestEmail, receiptEmail, revocationEmail, type ComposedEmail } from "./ClaEmails.js";

export const abandonedRetentionDays = 90;

const dayMs = 24 * 60 * 60 * 1000;
const maximumAge = 120;
const resendCooldownSeconds = 10 * 60;
const resendsPerDay = 5;
const batchSize = 100;
const finalStatuses: readonly ClaStatus[] = [
    ClaStatus.GuardianRejected,
    ClaStatus.GuardianExpired,
    ClaStatus.Superseded,
    ClaStatus.Revoked
];

export interface AgreementCheck {
    hasActiveAgreement(userId: string): Promise<boolean>;
}

export interface RequestOrigin {
    readonly ipAddress: string;
    readonly userAgent: string | null;
}

export interface ClaSignInput {
    readonly revision: number;
    readonly legalName: string;
    readonly email: string;
    readonly dateOfBirth: string;
    readonly country: string;
    readonly region: string | null;
    readonly guardian: GuardianInput | null;
}

export interface GuardianInput {
    readonly legalName: string;
    readonly relationship: GuardianRelationship;
    readonly email: string;
    readonly phone: string | null;
}

export interface GuardianDecisionInput {
    readonly decision: GuardianDecision;
    readonly legalName: string;
}

interface ContributorPii {
    readonly legalName: string;
    readonly email: string;
    readonly dateOfBirth: string;
    readonly ipAddress: string;
    readonly userAgent: string | null;
}

interface GuardianPii {
    readonly legalName: string;
    readonly relationship: GuardianRelationship;
    readonly email: string;
    readonly phone: string | null;
}

interface GuardianDecisionPii {
    readonly legalName: string;
    readonly ipAddress: string;
    readonly userAgent: string | null;
}

interface Accessor {
    readonly kind: ClaActorKind;
    readonly userId: string | null;
    readonly purpose: string;
}

type Signer = Pick<UserRecord, "id" | "discordId" | "discordUsername" | "discordAvatar">;

export interface ClaOverview {
    readonly document: { readonly revision: number; readonly title: string };
    readonly current: ClaSignatureRecord | null;
}

export interface SignatureListItem {
    readonly signature: ClaSignatureRecord;
    readonly user: Signer | null;
}

export interface AuditTrailView {
    readonly events: readonly { readonly event: ClaEventRecord; readonly actor: Signer | null }[];
    readonly isIntact: boolean;
}

export interface AccessLogItem {
    readonly entry: ClaPiiAccessLogRecord;
    readonly accessor: Signer | null;
}

export interface GuardianDecisionResult {
    readonly status: ClaStatus;
    readonly receipt: ClaReceiptDto | null;
}

const signerColumns = {
    id: users.id,
    discordId: users.discordId,
    discordUsername: users.discordUsername,
    discordAvatar: users.discordAvatar
};

export function documentHashOf(document: { readonly title: string; readonly sections: readonly StoredDocumentSection[] }): string {
    return sha256Hex(
        canonicalJson({
            title: document.title,
            sections: document.sections.map((section) => ({ id: section.id, title: section.title, html: section.html }))
        })
    );
}

function normalizeName(value: string): string {
    return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
}

function daysFrom(now: Date, days: number): Date {
    return new Date(now.getTime() + days * dayMs);
}

export class ClaService implements AgreementCheck {
    private readonly audit: ClaAuditTrail;

    public constructor(
        private readonly database: Database,
        private readonly documents: DocumentsService,
        private readonly store: KeyValueStore,
        private readonly emailSender: EmailSender,
        private readonly mailDomains: MailDomainChecker,
        private readonly cipher: PiiCipher,
        private readonly appKey: string,
        private readonly webOrigin: string,
        private readonly logger: FastifyBaseLogger
    ) {
        this.audit = new ClaAuditTrail(appKey);
    }

    public async hasActiveAgreement(userId: string): Promise<boolean> {
        const [row] = await this.database
            .select({ id: claSignatures.id })
            .from(claSignatures)
            .where(and(eq(claSignatures.userId, userId), eq(claSignatures.status, ClaStatus.Active)))
            .limit(1);
        return row !== undefined;
    }

    public async overview(userId: string): Promise<ClaOverview> {
        const document = await this.documents.get(DocumentSlug.Cla);
        const [current] = await this.database
            .select()
            .from(claSignatures)
            .where(eq(claSignatures.userId, userId))
            .orderBy(desc(claSignatures.signedAt))
            .limit(1);
        return { document: { revision: document.revision, title: document.title }, current: current ?? null };
    }

    public async sign(user: AuthenticatedUser, input: ClaSignInput, origin: RequestOrigin): Promise<ClaSignatureRecord> {
        if (user.isBlacklisted) {
            throw new ForbiddenError("Your account can't sign the agreement.", ErrorCode.UserBlacklisted);
        }
        const document = await this.documents.get(DocumentSlug.Cla);
        if (document.revision === 0) {
            throw new ConflictError("The contributor license agreement hasn't been published yet.");
        }
        if (input.revision !== document.revision) {
            throw new ConflictError("The agreement changed while you were reading it. Review the new version and sign again.");
        }
        const now = new Date();
        const region = this.resolveRegion(input.country, input.region);
        const ageOfMajority = ageOfMajorityFor(input.country, region);
        if (ageOfMajority === null) {
            throw new BadRequestError("Choose where you live.", ErrorCode.ValidationFailed);
        }
        const age = ageOn(input.dateOfBirth, now);
        if (age === null || age < 0 || age > maximumAge) {
            throw new BadRequestError("Enter a valid date of birth.", ErrorCode.ValidationFailed);
        }
        if (age < minimumClaAge) {
            throw new UnprocessableError(`You must be at least ${minimumClaAge} to sign the agreement.`, ErrorCode.ValidationFailed);
        }
        const isMinor = age < ageOfMajority;
        const contributorEmail = await this.acceptEmail(input.email);
        let guardian: GuardianPii | null = null;
        if (isMinor) {
            if (input.guardian === null) {
                throw new UnprocessableError(
                    "You're under the age of majority where you live, so a parent or guardian must consent.",
                    ErrorCode.GuardianRequired
                );
            }
            const guardianEmail = await this.acceptEmail(input.guardian.email);
            if (guardianEmail.canonical === contributorEmail.canonical) {
                throw new UnprocessableError("Your guardian needs to use their own email address.", ErrorCode.ValidationFailed);
            }
            if (normalizeName(input.guardian.legalName) === normalizeName(input.legalName)) {
                throw new UnprocessableError("Your guardian can't be you.", ErrorCode.ValidationFailed);
            }
            guardian = {
                legalName: input.guardian.legalName,
                relationship: input.guardian.relationship,
                email: guardianEmail.address,
                phone: input.guardian.phone
            };
        }

        const id = randomUUID();
        const contributor: ContributorPii = {
            legalName: input.legalName,
            email: contributorEmail.address,
            dateOfBirth: input.dateOfBirth,
            ipAddress: origin.ipAddress,
            userAgent: origin.userAgent
        };
        const token = guardian === null ? null : generateSecret("", 32);
        const values = {
            id,
            userId: user.id,
            status: guardian === null ? ClaStatus.Active : ClaStatus.PendingGuardian,
            documentRevision: document.revision,
            documentHash: documentHashOf(document),
            country: input.country,
            region,
            ageOfMajority,
            isMinor,
            contributorPii: this.cipher.encrypt(contributor, this.context(id, "contributor")),
            signedAt: now,
            guardianPii: guardian === null ? null : this.cipher.encrypt(guardian, this.context(id, "guardian")),
            guardianTokenHash: token === null ? null : sha256Hex(token),
            guardianRequestedAt: guardian === null ? null : now,
            guardianExpiresAt: guardian === null ? null : daysFrom(now, guardianConsentDays),
            activatedAt: guardian === null ? now : null
        };

        let saved: ClaSignatureRecord;
        try {
            saved = await this.database.transaction(async (transaction) => {
                const open = await transaction
                    .select()
                    .from(claSignatures)
                    .where(and(eq(claSignatures.userId, user.id), inArray(claSignatures.status, [...openClaStatuses])))
                    .for("update");
                for (const existing of open) {
                    if (existing.status === ClaStatus.Active) {
                        throw new ConflictError("You've already signed the contributor license agreement.");
                    }
                    await transaction
                        .update(claSignatures)
                        .set({ status: ClaStatus.Superseded, guardianTokenHash: null, purgeAfter: daysFrom(now, abandonedRetentionDays) })
                        .where(eq(claSignatures.id, existing.id));
                    await this.audit.append(transaction, existing.id, {
                        type: ClaEventType.Superseded,
                        actorKind: ClaActorKind.Contributor,
                        actorUserId: user.id,
                        details: { supersededBy: id }
                    });
                }
                const [inserted] = await transaction.insert(claSignatures).values(values).returning();
                if (inserted === undefined) {
                    throw new Error("Agreement insert returned no row.");
                }
                await this.audit.append(transaction, id, {
                    type: ClaEventType.Signed,
                    actorKind: ClaActorKind.Contributor,
                    actorUserId: user.id,
                    details: {
                        revision: document.revision,
                        documentHash: values.documentHash,
                        country: input.country,
                        region,
                        ageOfMajority,
                        isMinor
                    }
                });
                await this.audit.append(
                    transaction,
                    id,
                    guardian === null
                        ? { type: ClaEventType.Activated, actorKind: ClaActorKind.Contributor, actorUserId: user.id }
                        : {
                              type: ClaEventType.GuardianRequested,
                              actorKind: ClaActorKind.Contributor,
                              actorUserId: user.id,
                              details: { expiresAt: values.guardianExpiresAt?.toISOString() ?? null }
                          }
                );
                return inserted;
            });
        } catch (error: unknown) {
            if (isUniqueViolation(error)) {
                throw new ConflictError("You already have an agreement in progress. Reload to see it.");
            }
            throw error;
        }

        if (guardian === null || token === null) {
            await this.sendReceipts(saved.id);
        } else {
            await this.sendGuardianRequest(saved, token, contributor, guardian, user.discordUsername, document.title);
        }
        return saved;
    }

    public async resendGuardianRequest(user: AuthenticatedUser): Promise<ClaSignatureRecord> {
        const [pending] = await this.database
            .select()
            .from(claSignatures)
            .where(and(eq(claSignatures.userId, user.id), eq(claSignatures.status, ClaStatus.PendingGuardian)))
            .limit(1);
        if (pending === undefined) {
            throw new NotFoundError("Pending consent request");
        }
        if (pending.guardianExpiresAt === null || pending.guardianExpiresAt.getTime() <= Date.now()) {
            throw new ConflictError("This consent request has expired. Sign again to send a new one.");
        }
        if (!(await this.store.setIfAbsent(`cla:resend-cooldown:${user.id}`, "1", resendCooldownSeconds))) {
            throw new ApplicationError(429, ErrorCode.TooManyRequests, "Wait a few minutes before sending another email.", [], {
                "Retry-After": String(resendCooldownSeconds)
            });
        }
        if ((await this.store.incrementWithin(`cla:resends:${user.id}`, 86_400)) > resendsPerDay) {
            throw new ApplicationError(429, ErrorCode.TooManyRequests, "Too many emails sent today. Try again tomorrow.", [], {
                "Retry-After": "86400"
            });
        }
        const token = generateSecret("", 32);
        const updated = await this.database.transaction(async (transaction) => {
            const [locked] = await this.lock(transaction, pending.id);
            if (locked?.status !== ClaStatus.PendingGuardian) {
                throw new ConflictError("This consent request is no longer pending.");
            }
            const [saved] = await transaction
                .update(claSignatures)
                .set({ guardianTokenHash: sha256Hex(token) })
                .where(eq(claSignatures.id, pending.id))
                .returning();
            await this.audit.append(transaction, pending.id, {
                type: ClaEventType.GuardianEmailResent,
                actorKind: ClaActorKind.Contributor,
                actorUserId: user.id
            });
            return saved ?? locked;
        });
        const accessor = { kind: ClaActorKind.System, userId: null, purpose: "Guardian consent request email" };
        const contributor = await this.readContributor(this.database, updated, accessor, ["contributor.legalName"]);
        const guardian = await this.readGuardian(this.database, updated, accessor, ["guardian.legalName", "guardian.email"]);
        const document = await this.documents.get(DocumentSlug.Cla);
        await this.sendGuardianRequest(updated, token, contributor, guardian, user.discordUsername, document.title);
        return updated;
    }

    public async receiptFor(user: AuthenticatedUser): Promise<ClaReceiptDto> {
        const [active] = await this.database
            .select()
            .from(claSignatures)
            .where(and(eq(claSignatures.userId, user.id), eq(claSignatures.status, ClaStatus.Active)))
            .limit(1);
        if (active === undefined) {
            throw new NotFoundError("Signed agreement");
        }
        return this.buildReceipt(this.database, active, user.discordUsername, {
            kind: ClaActorKind.Contributor,
            userId: user.id,
            purpose: "Contributor receipt download"
        });
    }

    public async guardianReview(token: string): Promise<GuardianReviewDto> {
        const record = await this.pendingByToken(this.database, token);
        const accessor = { kind: ClaActorKind.Guardian, userId: null, purpose: "Guardian consent review" };
        const contributor = await this.readContributor(this.database, record, accessor, ["contributor.legalName"]);
        const guardian = await this.readGuardian(this.database, record, accessor, ["guardian.legalName", "guardian.relationship"]);
        const [document, username] = await Promise.all([
            this.documents.revision(DocumentSlug.Cla, record.documentRevision),
            this.usernameOf(record.userId)
        ]);
        return {
            status: record.status,
            contributor: { legalName: contributor.legalName, username },
            guardian: { legalName: guardian.legalName, relationship: guardian.relationship },
            document: { title: document.record.title, revision: record.documentRevision, sections: document.record.sections },
            signedAt: record.signedAt.toISOString(),
            expiresAt: (record.guardianExpiresAt ?? record.signedAt).toISOString()
        };
    }

    public async guardianDecide(token: string, input: GuardianDecisionInput, origin: RequestOrigin): Promise<GuardianDecisionResult> {
        const now = new Date();
        const guardian = await this.readGuardian(
            this.database,
            await this.pendingByToken(this.database, token),
            { kind: ClaActorKind.Guardian, userId: null, purpose: "Guardian decision" },
            ["guardian.legalName"]
        );
        if (normalizeName(input.legalName) !== normalizeName(guardian.legalName)) {
            throw new UnprocessableError(`Type your full legal name exactly as shown: ${guardian.legalName}.`, ErrorCode.ValidationFailed);
        }
        const decided = await this.database.transaction(async (transaction) => {
            const pending = await this.pendingByToken(transaction, token, true);
            const decision: GuardianDecisionPii = { legalName: input.legalName, ipAddress: origin.ipAddress, userAgent: origin.userAgent };
            const approved = input.decision === GuardianDecision.Approve;
            const [saved] = await transaction
                .update(claSignatures)
                .set({
                    status: approved ? ClaStatus.Active : ClaStatus.GuardianRejected,
                    guardianDecidedAt: now,
                    guardianDecisionPii: this.cipher.encrypt(decision, this.context(pending.id, "guardian-decision")),
                    guardianTokenHash: null,
                    activatedAt: approved ? now : null,
                    purgeAfter: approved ? null : daysFrom(now, abandonedRetentionDays)
                })
                .where(eq(claSignatures.id, pending.id))
                .returning();
            if (saved === undefined) {
                throw new NotFoundError("Consent request");
            }
            await this.audit.append(transaction, pending.id, {
                type: approved ? ClaEventType.GuardianApproved : ClaEventType.GuardianRejected,
                actorKind: ClaActorKind.Guardian,
                actorUserId: null
            });
            if (approved) {
                await this.audit.append(transaction, pending.id, {
                    type: ClaEventType.Activated,
                    actorKind: ClaActorKind.Guardian,
                    actorUserId: null
                });
            }
            return saved;
        });

        if (decided.status !== ClaStatus.Active) {
            await this.notifyContributor(decided, "Guardian decision notice", (contributor, title) =>
                guardianDeclinedEmail({ contributorName: contributor.legalName, documentTitle: title })
            );
            return { status: decided.status, receipt: null };
        }
        await this.sendReceipts(decided.id);
        const receipt = await this.buildReceipt(this.database, decided, await this.usernameOf(decided.userId), {
            kind: ClaActorKind.Guardian,
            userId: null,
            purpose: "Guardian receipt"
        });
        return { status: decided.status, receipt };
    }

    public async revokeOwn(user: AuthenticatedUser, reason: string | null): Promise<ClaSignatureRecord> {
        const [open] = await this.database
            .select()
            .from(claSignatures)
            .where(and(eq(claSignatures.userId, user.id), inArray(claSignatures.status, [...openClaStatuses])))
            .limit(1);
        if (open === undefined) {
            throw new NotFoundError("Signed agreement");
        }
        return this.revoke(open.id, { kind: ClaActorKind.Contributor, userId: user.id }, reason);
    }

    public async revokeByStaff(actor: UserActor, signatureId: string, reason: string): Promise<ClaSignatureRecord> {
        return this.revoke(signatureId, { kind: ClaActorKind.Staff, userId: actor.userId }, reason);
    }

    public async expirePending(now: Date = new Date()): Promise<number> {
        const due = await this.database
            .select({ id: claSignatures.id })
            .from(claSignatures)
            .where(and(eq(claSignatures.status, ClaStatus.PendingGuardian), lte(claSignatures.guardianExpiresAt, now)))
            .limit(batchSize);
        let expired = 0;
        for (const { id } of due) {
            const changed = await this.database.transaction(async (transaction) => {
                const [locked] = await this.lock(transaction, id);
                if (
                    locked?.status !== ClaStatus.PendingGuardian ||
                    locked.guardianExpiresAt === null ||
                    locked.guardianExpiresAt.getTime() > now.getTime()
                ) {
                    return false;
                }
                await transaction
                    .update(claSignatures)
                    .set({ status: ClaStatus.GuardianExpired, guardianTokenHash: null, purgeAfter: daysFrom(now, abandonedRetentionDays) })
                    .where(eq(claSignatures.id, id));
                await this.audit.append(transaction, id, {
                    type: ClaEventType.GuardianExpired,
                    actorKind: ClaActorKind.System,
                    actorUserId: null
                });
                return true;
            });
            expired += changed ? 1 : 0;
        }
        return expired;
    }

    public async purgeExpiredPii(now: Date = new Date()): Promise<number> {
        const due = await this.database
            .select({ id: claSignatures.id })
            .from(claSignatures)
            .where(
                and(
                    isNull(claSignatures.piiPurgedAt),
                    lte(claSignatures.purgeAfter, now),
                    notInArray(claSignatures.status, [...openClaStatuses])
                )
            )
            .limit(batchSize);
        for (const { id } of due) {
            await this.database.transaction(async (transaction) => {
                const [locked] = await this.lock(transaction, id);
                if (locked === undefined || locked.piiPurgedAt !== null || !finalStatuses.includes(locked.status)) {
                    return;
                }
                await transaction
                    .update(claSignatures)
                    .set({
                        contributorPii: null,
                        guardianPii: null,
                        guardianDecisionPii: null,
                        guardianTokenHash: null,
                        revocationReason: null,
                        piiPurgedAt: now
                    })
                    .where(eq(claSignatures.id, id));
                await this.audit.append(transaction, id, {
                    type: ClaEventType.PiiPurged,
                    actorKind: ClaActorKind.System,
                    actorUserId: null
                });
            });
        }
        return due.length;
    }

    public async list(query: PaginationQuery & { readonly status?: ClaStatus | undefined }): Promise<Page<SignatureListItem>> {
        const filter: SQL | undefined = query.status === undefined ? undefined : eq(claSignatures.status, query.status);
        const [rows, totals] = await Promise.all([
            this.database
                .select({ signature: claSignatures, user: signerColumns })
                .from(claSignatures)
                .leftJoin(users, eq(users.id, claSignatures.userId))
                .where(filter)
                .orderBy(desc(claSignatures.signedAt))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(claSignatures).where(filter)
        ]);
        return createPage(
            rows.map((row) => ({ signature: row.signature, user: row.user })),
            totals[0]?.total ?? 0,
            query
        );
    }

    public async auditTrail(signatureId: string): Promise<AuditTrailView> {
        await this.find(this.database, signatureId);
        const rows = await this.database
            .select({ event: claEvents, actor: signerColumns })
            .from(claEvents)
            .leftJoin(users, eq(users.id, claEvents.actorUserId))
            .where(eq(claEvents.signatureId, signatureId))
            .orderBy(asc(claEvents.sequence));
        return { events: rows, isIntact: this.audit.isIntact(rows.map((row) => row.event)) };
    }

    public async revealPii(actor: UserActor, signatureId: string, reason: string): Promise<ClaPiiDto> {
        const record = await this.find(this.database, signatureId);
        const accessor = { kind: ClaActorKind.Staff, userId: actor.userId, purpose: reason };
        if (record.contributorPii === null) {
            throw new ConflictError("Personal data for this agreement has been purged.");
        }
        await this.logAccess(this.database, record.id, accessor, [
            "contributor.legalName",
            "contributor.email",
            "contributor.dateOfBirth",
            "contributor.ipAddress",
            "contributor.userAgent",
            ...(record.guardianPii === null ? [] : ["guardian.legalName", "guardian.relationship", "guardian.email", "guardian.phone"]),
            ...(record.guardianDecisionPii === null
                ? []
                : ["guardianDecision.legalName", "guardianDecision.ipAddress", "guardianDecision.userAgent"])
        ]);
        const contributor = this.cipher.decrypt(record.contributorPii, this.context(record.id, "contributor")) as ContributorPii;
        const guardian =
            record.guardianPii === null
                ? null
                : (this.cipher.decrypt(record.guardianPii, this.context(record.id, "guardian")) as GuardianPii);
        const decision =
            record.guardianDecisionPii === null
                ? null
                : (this.cipher.decrypt(record.guardianDecisionPii, this.context(record.id, "guardian-decision")) as GuardianDecisionPii);
        return {
            contributor: { ...contributor, userAgent: contributor.userAgent ?? null },
            guardian: guardian === null ? null : { ...guardian, phone: guardian.phone ?? null },
            guardianDecision: decision === null ? null : { ...decision, userAgent: decision.userAgent ?? null }
        };
    }

    public async accessLog(query: PaginationQuery & { readonly signatureId?: string | undefined }): Promise<Page<AccessLogItem>> {
        const filter = query.signatureId === undefined ? undefined : eq(claPiiAccessLog.signatureId, query.signatureId);
        const [rows, totals] = await Promise.all([
            this.database
                .select({ entry: claPiiAccessLog, accessor: signerColumns })
                .from(claPiiAccessLog)
                .leftJoin(users, eq(users.id, claPiiAccessLog.accessorUserId))
                .where(filter)
                .orderBy(desc(claPiiAccessLog.accessedAt))
                .limit(query.perPage)
                .offset(offsetOf(query)),
            this.database.select({ total: count() }).from(claPiiAccessLog).where(filter)
        ]);
        return createPage(rows, totals[0]?.total ?? 0, query);
    }

    private async revoke(
        signatureId: string,
        actor: { readonly kind: ClaActorKind; readonly userId: string },
        reason: string | null
    ): Promise<ClaSignatureRecord> {
        const now = new Date();
        const revoked = await this.database.transaction(async (transaction) => {
            const [locked] = await this.lock(transaction, signatureId);
            if (locked === undefined) {
                throw new NotFoundError("Agreement");
            }
            if (!openClaStatuses.includes(locked.status)) {
                throw new ConflictError("Only signed or pending agreements can be revoked.");
            }
            const hasContributions = await this.hasContributions(transaction, locked.userId);
            const [saved] = await transaction
                .update(claSignatures)
                .set({
                    status: ClaStatus.Revoked,
                    revokedAt: now,
                    revokedBy: actor.userId,
                    revocationReason: reason,
                    guardianTokenHash: null,
                    purgeAfter: hasContributions ? null : daysFrom(now, abandonedRetentionDays)
                })
                .where(eq(claSignatures.id, signatureId))
                .returning();
            await this.audit.append(transaction, signatureId, {
                type: ClaEventType.Revoked,
                actorKind: actor.kind,
                actorUserId: actor.userId,
                details: { previousStatus: locked.status, retainedForContributions: hasContributions }
            });
            return saved ?? locked;
        });
        await this.notifyContributor(revoked, "Revocation notice", (contributor, title) =>
            revocationEmail({
                contributorName: contributor.legalName,
                documentTitle: title,
                revokedAt: now,
                byStaff: actor.kind === ClaActorKind.Staff
            })
        );
        return revoked;
    }

    private async hasContributions(executor: DatabaseExecutor, userId: string): Promise<boolean> {
        const [submission] = await executor
            .select({ id: submissions.id })
            .from(submissions)
            .where(eq(submissions.contributorId, userId))
            .limit(1);
        if (submission !== undefined) {
            return true;
        }
        const [entry] = await executor.select({ id: entries.id }).from(entries).where(eq(entries.submittedBy, userId)).limit(1);
        return entry !== undefined;
    }

    private async sendReceipts(signatureId: string): Promise<void> {
        try {
            const record = await this.find(this.database, signatureId);
            const receipt = await this.buildReceipt(this.database, record, await this.usernameOf(record.userId), {
                kind: ClaActorKind.System,
                userId: null,
                purpose: "Receipt email"
            });
            const recipients: ["contributor" | "guardian", string][] = [["contributor", receipt.contributor.email]];
            if (receipt.guardian !== null) {
                recipients.push(["guardian", receipt.guardian.email]);
            }
            for (const [recipient, address] of recipients) {
                await this.deliver(address, receiptEmail(receipt, recipient), `cla-receipt:${record.id}:${recipient}`);
                await this.database.transaction(async (transaction) => {
                    await this.lock(transaction, record.id);
                    await this.audit.append(transaction, record.id, {
                        type: ClaEventType.ReceiptSent,
                        actorKind: ClaActorKind.System,
                        actorUserId: null,
                        details: { recipient }
                    });
                });
            }
        } catch (error: unknown) {
            this.logger.error({ err: error, signatureId }, "agreement receipt email failed");
        }
    }

    private async sendGuardianRequest(
        record: ClaSignatureRecord,
        token: string,
        contributor: Pick<ContributorPii, "legalName">,
        guardian: Pick<GuardianPii, "legalName" | "email" | "relationship">,
        username: string,
        documentTitle: string
    ): Promise<void> {
        try {
            await this.deliver(
                guardian.email,
                guardianRequestEmail({
                    guardianName: guardian.legalName,
                    contributorName: contributor.legalName,
                    username,
                    relationship: guardian.relationship,
                    documentTitle,
                    link: `${this.webOrigin}/cla/guardian/${token}`,
                    expiresAt: record.guardianExpiresAt ?? record.signedAt
                }),
                `cla-guardian:${record.id}:${sha256Hex(token)}`
            );
        } catch (error: unknown) {
            this.logger.error({ err: error, signatureId: record.id }, "guardian consent email failed");
        }
    }

    private async notifyContributor(
        record: ClaSignatureRecord,
        purpose: string,
        compose: (contributor: ContributorPii, documentTitle: string) => ComposedEmail
    ): Promise<void> {
        try {
            if (record.contributorPii === null) {
                return;
            }
            const contributor = await this.readContributor(this.database, record, { kind: ClaActorKind.System, userId: null, purpose }, [
                "contributor.legalName",
                "contributor.email"
            ]);
            const document = await this.documents.get(DocumentSlug.Cla);
            await this.deliver(contributor.email, compose(contributor, document.title), `cla-notice:${record.id}:${record.status}`);
        } catch (error: unknown) {
            this.logger.error({ err: error, signatureId: record.id }, "agreement notice email failed");
        }
    }

    private async deliver(to: string, email: ComposedEmail, key: string): Promise<void> {
        await this.emailSender.send({ to, ...email, idempotencyKey: hmacHex(this.appKey, key, 48) });
    }

    private async buildReceipt(
        executor: DatabaseExecutor,
        record: ClaSignatureRecord,
        username: string,
        accessor: Accessor
    ): Promise<ClaReceiptDto> {
        const contributor = await this.readContributor(executor, record, accessor, [
            "contributor.legalName",
            "contributor.email",
            "contributor.dateOfBirth",
            ...(record.guardianPii === null ? [] : ["guardian.legalName", "guardian.relationship", "guardian.email", "guardian.phone"])
        ]);
        const guardian =
            record.guardianPii === null
                ? null
                : (this.cipher.decrypt(record.guardianPii, this.context(record.id, "guardian")) as GuardianPii);
        const document = await this.documents.revision(DocumentSlug.Cla, record.documentRevision);
        return {
            signatureId: record.id,
            status: record.status,
            document: {
                title: document.record.title,
                revision: record.documentRevision,
                hash: record.documentHash,
                sections: document.record.sections
            },
            contributor: {
                legalName: contributor.legalName,
                username,
                email: contributor.email,
                dateOfBirth: contributor.dateOfBirth,
                country: record.country,
                region: record.region,
                signedAt: record.signedAt.toISOString()
            },
            guardian:
                guardian === null
                    ? null
                    : {
                          legalName: guardian.legalName,
                          relationship: guardian.relationship,
                          email: guardian.email,
                          phone: guardian.phone ?? null,
                          consentedAt:
                              record.status === ClaStatus.Active || record.status === ClaStatus.Revoked
                                  ? (record.guardianDecidedAt?.toISOString() ?? null)
                                  : null
                      },
            isMinor: record.isMinor,
            ageOfMajority: record.ageOfMajority,
            activatedAt: record.activatedAt?.toISOString() ?? null,
            issuedAt: new Date().toISOString()
        };
    }

    private async readContributor(
        executor: DatabaseExecutor,
        record: ClaSignatureRecord,
        accessor: Accessor,
        fields: readonly string[]
    ): Promise<ContributorPii> {
        if (record.contributorPii === null) {
            throw new ConflictError("Personal data for this agreement has been purged.");
        }
        await this.logAccess(executor, record.id, accessor, fields);
        return this.cipher.decrypt(record.contributorPii, this.context(record.id, "contributor")) as ContributorPii;
    }

    private async readGuardian(
        executor: DatabaseExecutor,
        record: ClaSignatureRecord,
        accessor: Accessor,
        fields: readonly string[]
    ): Promise<GuardianPii> {
        if (record.guardianPii === null) {
            throw new ConflictError("Guardian details for this agreement are not available.");
        }
        await this.logAccess(executor, record.id, accessor, fields);
        return this.cipher.decrypt(record.guardianPii, this.context(record.id, "guardian")) as GuardianPii;
    }

    private async logAccess(executor: DatabaseExecutor, signatureId: string, accessor: Accessor, fields: readonly string[]): Promise<void> {
        await executor.insert(claPiiAccessLog).values({
            signatureId,
            accessorKind: accessor.kind,
            accessorUserId: accessor.userId,
            purpose: accessor.purpose,
            fields: [...fields]
        });
    }

    private async pendingByToken(executor: DatabaseExecutor, token: string, forUpdate = false): Promise<ClaSignatureRecord> {
        const query = executor
            .select()
            .from(claSignatures)
            .where(eq(claSignatures.guardianTokenHash, sha256Hex(token)))
            .limit(1);
        const [record] = forUpdate ? await query.for("update") : await query;
        if (record?.status !== ClaStatus.PendingGuardian) {
            throw new NotFoundError("Consent request");
        }
        if (record.guardianExpiresAt === null || record.guardianExpiresAt.getTime() <= Date.now()) {
            throw new ConflictError("This consent request has expired.");
        }
        return record;
    }

    private async find(executor: DatabaseExecutor, signatureId: string): Promise<ClaSignatureRecord> {
        const [record] = await executor.select().from(claSignatures).where(eq(claSignatures.id, signatureId)).limit(1);
        if (record === undefined) {
            throw new NotFoundError("Agreement");
        }
        return record;
    }

    private lock(executor: DatabaseExecutor, signatureId: string): Promise<ClaSignatureRecord[]> {
        return executor.select().from(claSignatures).where(eq(claSignatures.id, signatureId)).limit(1).for("update");
    }

    private async usernameOf(userId: string): Promise<string> {
        const [row] = await this.database.select({ username: users.discordUsername }).from(users).where(eq(users.id, userId)).limit(1);
        return row?.username ?? "Unknown";
    }

    private async acceptEmail(raw: string): Promise<ParsedEmail> {
        const parsed = parseEmail(raw);
        if (parsed === null) {
            throw new BadRequestError("Enter a valid email address.", ErrorCode.ValidationFailed);
        }
        if (isDisposableDomain(parsed.domain) || !(await this.mailDomains.acceptsMail(parsed.domain))) {
            throw new BadRequestError("Use a permanent email address you can receive mail at.", ErrorCode.ValidationFailed);
        }
        return parsed;
    }

    private resolveRegion(country: string, region: string | null): string | null {
        const known = regionsOf(country);
        if (known === null) {
            return null;
        }
        if (region === null || !known.some((candidate) => candidate.code === region)) {
            throw new BadRequestError("Choose your state, province or territory.", ErrorCode.ValidationFailed);
        }
        return region;
    }

    private context(signatureId: string, part: string): string {
        return `cla:${signatureId}:${part}`;
    }
}
