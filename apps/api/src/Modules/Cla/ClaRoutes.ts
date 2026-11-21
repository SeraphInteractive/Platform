import {
    claAccessLogEntrySchema,
    claAgreementSchema,
    claAuditTrailSchema,
    claPiiRequestSchema,
    claPiiSchema,
    claReceiptSchema,
    claRevokeInputSchema,
    claSignatureSummarySchema,
    claSignInputSchema,
    claStaffRevokeInputSchema,
    ClaStatus,
    guardianDecisionInputSchema,
    guardianDecisionResultSchema,
    guardianReviewSchema,
    myClaSchema,
    type ClaAgreementDto,
    type ClaSignatureSummaryDto
} from "@platform/contracts";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, pageEnvelope, paginationQuerySchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { currentUser, requireAcceptedTerms, requireRole, requireUser, userActorOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import type { ClaSignatureRecord } from "../../Infrastructure/Database/Schema.js";
import { toUserSummary } from "../Users/UserPresenter.js";
import type { RequestOrigin, SignatureListItem } from "./ClaService.js";

const tokenParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) });
const signatureParams = z.object({ signatureId: uuidSchema });

function originOf(request: FastifyRequest): RequestOrigin {
    const userAgent = request.headers["user-agent"];
    return { ipAddress: request.ip, userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null };
}

function presentAgreement(record: ClaSignatureRecord): ClaAgreementDto {
    return {
        id: record.id,
        status: record.status,
        revision: record.documentRevision,
        isMinor: record.isMinor,
        signedAt: toIso(record.signedAt),
        activatedAt: toIso(record.activatedAt),
        revokedAt: toIso(record.revokedAt),
        guardian: record.isMinor
            ? {
                  requestedAt: toIso(record.guardianRequestedAt),
                  expiresAt: toIso(record.guardianExpiresAt),
                  decidedAt: toIso(record.guardianDecidedAt)
              }
            : null
    };
}

function presentSummary({ signature, user }: SignatureListItem): ClaSignatureSummaryDto {
    return {
        id: signature.id,
        user: user === null ? null : toUserSummary(user),
        status: signature.status,
        revision: signature.documentRevision,
        country: signature.country,
        region: signature.region,
        isMinor: signature.isMinor,
        ageOfMajority: signature.ageOfMajority,
        signedAt: toIso(signature.signedAt),
        activatedAt: toIso(signature.activatedAt),
        guardianRequestedAt: toIso(signature.guardianRequestedAt),
        guardianExpiresAt: toIso(signature.guardianExpiresAt),
        guardianDecidedAt: toIso(signature.guardianDecidedAt),
        revokedAt: toIso(signature.revokedAt),
        purgeAfter: toIso(signature.purgeAfter),
        piiPurgedAt: toIso(signature.piiPurgedAt)
    };
}

export const claRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { claService } = services;
    const security = [{ bearer: [] }];
    const staff = requireRole(Role.Admin);
    const noStore = { "Cache-Control": "no-store" };

    application.get(
        "/cla/me",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Agreements"],
                summary: "Your contributor license agreement status.",
                security,
                response: { 200: dataEnvelope(myClaSchema), ...errorResponses }
            }
        },
        async (request) => {
            const overview = await claService.overview(currentUser(request).id);
            return {
                data: { document: overview.document, current: overview.current === null ? null : presentAgreement(overview.current) }
            };
        }
    );

    application.post(
        "/cla/me",
        {
            preHandler: requireAcceptedTerms(services.documentsService),
            config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "Sign the contributor license agreement. Minors also name a guardian who must consent.",
                security,
                body: claSignInputSchema,
                response: { 201: dataEnvelope(claAgreementSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const signed = await claService.sign(currentUser(request), request.body, originOf(request));
            return reply
                .status(201)
                .headers(noStore)
                .send({ data: presentAgreement(signed) });
        }
    );

    application.post(
        "/cla/me/guardian/resend",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "Send your guardian a fresh consent link.",
                security,
                response: { 200: dataEnvelope(claAgreementSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentAgreement(await claService.resendGuardianRequest(currentUser(request))) })
    );

    application.post(
        "/cla/me/revoke",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "Revoke your agreement. You can't claim or submit work until you sign again.",
                security,
                body: claRevokeInputSchema.default({ reason: null }),
                response: { 200: dataEnvelope(claAgreementSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentAgreement(await claService.revokeOwn(currentUser(request), request.body.reason)) })
    );

    application.get(
        "/cla/me/receipt",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "A copy of your signed agreement.",
                security,
                response: { 200: dataEnvelope(claReceiptSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.headers(noStore);
            return { data: await claService.receiptFor(currentUser(request)) };
        }
    );

    application.get(
        "/cla/guardian/:token",
        {
            config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "The consent request a guardian was emailed.",
                params: tokenParams,
                response: { 200: dataEnvelope(guardianReviewSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.headers(noStore);
            return { data: await claService.guardianReview(request.params.token) };
        }
    );

    application.post(
        "/cla/guardian/:token",
        {
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "Approve or decline a consent request.",
                params: tokenParams,
                body: guardianDecisionInputSchema,
                response: { 200: dataEnvelope(guardianDecisionResultSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.headers(noStore);
            return { data: await claService.guardianDecide(request.params.token, request.body, originOf(request)) };
        }
    );

    application.get(
        "/cla/signatures",
        {
            preHandler: staff,
            schema: {
                tags: ["Agreements"],
                summary: "List agreements without personal data.",
                security,
                querystring: paginationQuerySchema.extend({ status: z.enum(ClaStatus).optional() }),
                response: { 200: pageEnvelope(claSignatureSummarySchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await claService.list(request.query);
            return { data: page.data.map(presentSummary), meta: page.meta };
        }
    );

    application.get(
        "/cla/signatures/:signatureId/events",
        {
            preHandler: staff,
            schema: {
                tags: ["Agreements"],
                summary: "The agreement's audit trail and whether its hash chain is intact.",
                security,
                params: signatureParams,
                response: { 200: dataEnvelope(claAuditTrailSchema), ...errorResponses }
            }
        },
        async (request) => {
            const trail = await claService.auditTrail(request.params.signatureId);
            return {
                data: {
                    isIntact: trail.isIntact,
                    events: trail.events.map(({ event, actor }) => ({
                        id: event.id,
                        sequence: event.sequence,
                        type: event.type,
                        actorKind: event.actorKind,
                        actor: actor === null ? null : toUserSummary(actor),
                        details: { ...event.details },
                        hash: event.hash,
                        occurredAt: toIso(event.occurredAt)
                    }))
                }
            };
        }
    );

    application.post(
        "/cla/signatures/:signatureId/pii",
        {
            preHandler: staff,
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Agreements"],
                summary: "Decrypt an agreement's personal data. Every access is logged with its reason.",
                security,
                params: signatureParams,
                body: claPiiRequestSchema,
                response: { 200: dataEnvelope(claPiiSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.headers(noStore);
            return { data: await claService.revealPii(userActorOf(request), request.params.signatureId, request.body.reason) };
        }
    );

    application.post(
        "/cla/signatures/:signatureId/revoke",
        {
            preHandler: staff,
            schema: {
                tags: ["Agreements"],
                summary: "Revoke an agreement on the contributor's or guardian's behalf.",
                security,
                params: signatureParams,
                body: claStaffRevokeInputSchema,
                response: { 200: dataEnvelope(claAgreementSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: presentAgreement(await claService.revokeByStaff(userActorOf(request), request.params.signatureId, request.body.reason))
        })
    );

    application.get(
        "/cla/access-log",
        {
            preHandler: requireRole(Role.SuperAdmin),
            schema: {
                tags: ["Agreements"],
                summary: "Who read agreement personal data, when and why.",
                security,
                querystring: paginationQuerySchema.extend({ signatureId: uuidSchema.optional() }),
                response: { 200: pageEnvelope(claAccessLogEntrySchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await claService.accessLog(request.query);
            return {
                data: page.data.map(({ entry, accessor }) => ({
                    id: entry.id,
                    signatureId: entry.signatureId,
                    accessorKind: entry.accessorKind,
                    accessor: accessor === null ? null : toUserSummary(accessor),
                    purpose: entry.purpose,
                    fields: entry.fields,
                    accessedAt: toIso(entry.accessedAt)
                })),
                meta: page.meta
            };
        }
    );
};
