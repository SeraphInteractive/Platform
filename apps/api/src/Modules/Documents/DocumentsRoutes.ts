import {
    documentRevisionSchema,
    documentRevisionSummarySchema,
    documentSchema,
    DocumentSlug,
    documentUpdateSchema,
    legalAcceptanceSchema,
    type DocumentDto,
    type DocumentRevisionSummaryDto
} from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, toIso } from "../../Common/Http/Schemas.js";
import { requireRole, userActorOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { toUserSummary } from "../Users/UserPresenter.js";
import type { DocumentView, RevisionView } from "./DocumentsService.js";

const slugParams = z.object({ slug: z.enum(DocumentSlug) });
const revisionParams = slugParams.extend({ revision: z.coerce.number().int().positive() });

function presentDocument(document: DocumentView): DocumentDto {
    return {
        slug: document.slug,
        title: document.title,
        sections: [...document.sections],
        revision: document.revision,
        updatedAt: toIso(document.updatedAt),
        updatedBy: document.updatedBy === null ? null : toUserSummary(document.updatedBy)
    };
}

function presentRevision({ record, author }: RevisionView): DocumentRevisionSummaryDto {
    return {
        revision: record.revision,
        title: record.title,
        note: record.note,
        requiresReacceptance: record.requiresReacceptance,
        author: author === null ? null : toUserSummary(author),
        createdAt: toIso(record.createdAt)
    };
}

export const documentsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { documentsService } = services;
    const security = [{ bearer: [] }];
    const editor = requireRole(Role.Supervisor);

    application.get(
        "/legal/acceptance",
        {
            schema: {
                tags: ["Documents"],
                summary: "The terms version users must have accepted.",
                response: { 200: dataEnvelope(legalAcceptanceSchema), ...errorResponses }
            }
        },
        async (_request, reply) => {
            void reply.header('Cache-Control', 'public, max-age=60');
            return { data: { version: await documentsService.currentAcceptanceVersion() } };
        }
    );

    application.get(
        "/documents/:slug",
        {
            schema: {
                tags: ["Documents"],
                summary: "Get the published guidelines or a legal document.",
                params: slugParams,
                response: { 200: dataEnvelope(documentSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
            return { data: presentDocument(await documentsService.get(request.params.slug)) };
        }
    );

    application.put(
        "/documents/:slug",
        {
            preHandler: editor,
            bodyLimit: 5 * 1024 * 1024,
            config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
            schema: {
                tags: ["Documents"],
                summary: "Publish a new revision of a document.",
                security,
                params: slugParams,
                body: documentUpdateSchema,
                response: { 200: dataEnvelope(documentSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: presentDocument(await documentsService.publish(userActorOf(request), request.params.slug, request.body))
        })
    );

    application.get(
        "/documents/:slug/revisions",
        {
            preHandler: editor,
            schema: {
                tags: ["Documents"],
                summary: "List a document's published revisions.",
                security,
                params: slugParams,
                response: { 200: dataEnvelope(z.array(documentRevisionSummarySchema)), ...errorResponses }
            }
        },
        async (request) => ({ data: (await documentsService.revisions(request.params.slug)).map(presentRevision) })
    );

    application.get(
        "/documents/:slug/revisions/:revision",
        {
            preHandler: editor,
            schema: {
                tags: ["Documents"],
                summary: "Get one published revision in full.",
                security,
                params: revisionParams,
                response: { 200: dataEnvelope(documentRevisionSchema), ...errorResponses }
            }
        },
        async (request) => {
            const view = await documentsService.revision(request.params.slug, request.params.revision);
            return { data: { ...presentRevision(view), sections: view.record.sections } };
        }
    );
};
