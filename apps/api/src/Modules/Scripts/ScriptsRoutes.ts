import {
    addScreenplayCollaboratorSchema,
    createScreenplaySchema,
    createScreenplayShelfSchema,
    createScreenplayVersionSchema,
    screenplayCollaboratorSchema,
    screenplaySchema,
    screenplayShelfSchema,
    screenplaySummarySchema,
    screenplayVersionSchema,
    updateScreenplaySchema,
    uuidSchema
} from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { requireUser, userPrincipalOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";

const idParams = z.object({ id: uuidSchema });
const versionParams = z.object({ id: uuidSchema, versionId: uuidSchema });
const collaboratorParams = z.object({ id: uuidSchema, userId: uuidSchema });

export const scriptsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { scriptsService } = services;
    const security = [{ bearer: [] }];
    const userOnly = requireUser();

    // 10 mb body limit to support feature script json without payload rejection
    const screenplayBodyLimit = 10 * 1024 * 1024;

    application.get(
        "/",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "List screenplays accessible to the authenticated user.",
                security,
                response: { 200: dataEnvelope(z.array(screenplaySummarySchema)), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.listScripts(user) };
        }
    );

    application.post(
        "/",
        {
            preHandler: userOnly,
            bodyLimit: screenplayBodyLimit,
            schema: {
                tags: ["Scripts"],
                summary: "Create a new screenplay.",
                security,
                body: createScreenplaySchema,
                response: { 201: dataEnvelope(screenplaySchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            const script = await scriptsService.createScript(user, request.body);
            void reply.status(201);
            return { data: script };
        }
    );

    application.get(
        "/shelves",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "List custom script shelves for the user.",
                security,
                response: { 200: dataEnvelope(z.array(screenplayShelfSchema)), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.listShelves(user) };
        }
    );

    application.post(
        "/shelves",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Create a new script shelf.",
                security,
                body: createScreenplayShelfSchema,
                response: { 201: dataEnvelope(screenplayShelfSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            const shelf = await scriptsService.createShelf(user, request.body);
            void reply.status(201);
            return { data: shelf };
        }
    );

    application.delete(
        "/shelves/:id",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Delete a script shelf.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            await scriptsService.deleteShelf(request.params.id, user);
            void reply.status(204);
            return null;
        }
    );

    application.get(
        "/:id",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Get a screenplay document by id.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(screenplaySchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.getScript(request.params.id, user) };
        }
    );

    application.patch(
        "/:id",
        {
            preHandler: userOnly,
            bodyLimit: screenplayBodyLimit,
            schema: {
                tags: ["Scripts"],
                summary: "Update screenplay document content, metadata, or layout.",
                security,
                params: idParams,
                body: updateScreenplaySchema,
                response: { 200: dataEnvelope(screenplaySchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.updateScript(request.params.id, user, request.body) };
        }
    );

    application.delete(
        "/:id",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Delete a screenplay.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            await scriptsService.deleteScript(request.params.id, user);
            void reply.status(204);
            return null;
        }
    );

    application.post(
        "/:id/duplicate",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Duplicate a screenplay.",
                security,
                params: idParams,
                response: { 201: dataEnvelope(screenplaySchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            const script = await scriptsService.duplicateScript(request.params.id, user);
            void reply.status(201);
            return { data: script };
        }
    );

    application.get(
        "/:id/versions",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "List version snapshots for a screenplay.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(z.array(screenplayVersionSchema)), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.listVersions(request.params.id, user) };
        }
    );

    application.post(
        "/:id/versions",
        {
            preHandler: userOnly,
            bodyLimit: screenplayBodyLimit,
            schema: {
                tags: ["Scripts"],
                summary: "Create a version snapshot for a screenplay.",
                security,
                params: idParams,
                body: createScreenplayVersionSchema,
                response: { 201: dataEnvelope(screenplayVersionSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            const version = await scriptsService.createVersion(request.params.id, user, request.body);
            void reply.status(201);
            return { data: version };
        }
    );

    application.post(
        "/:id/versions/:versionId/restore",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Restore screenplay to a specific version snapshot.",
                security,
                params: versionParams,
                response: { 200: dataEnvelope(screenplaySchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.restoreVersion(request.params.id, request.params.versionId, user) };
        }
    );

    application.post(
        "/:id/collaborators",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Add or update a collaborator on a screenplay.",
                security,
                params: idParams,
                body: addScreenplayCollaboratorSchema,
                response: { 200: dataEnvelope(screenplayCollaboratorSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            return { data: await scriptsService.addCollaborator(request.params.id, user, request.body) };
        }
    );

    application.delete(
        "/:id/collaborators/:userId",
        {
            preHandler: userOnly,
            schema: {
                tags: ["Scripts"],
                summary: "Remove a collaborator from a screenplay.",
                security,
                params: collaboratorParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            await scriptsService.removeCollaborator(request.params.id, user, request.params.userId);
            void reply.status(204);
            return null;
        }
    );
};
