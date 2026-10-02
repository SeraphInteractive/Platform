import { entrySchema, fieldRules } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, pageEnvelope, paginationQuerySchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { actorOf, currentUser, optionalUser, requireParticipant, requireRole, requireUser } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { EntryStatus } from "../../Domain/Enums.js";
import { Role } from "../../Domain/Roles.js";
import type { EntryRecord } from "../../Infrastructure/Database/Schema.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import { toUserSummary } from "../Users/UserPresenter.js";
import type { EntryWithAuthor } from "./EntriesService.js";

const roundParams = z.object({ roundId: uuidSchema });
const entryParams = z.object({ roundId: uuidSchema, entryId: uuidSchema });
const mediaKeySchema = z.string().max(255);

const pitchSchema = fieldRules.entryTitle;
const descriptionSchema = fieldRules.entryDescription;

export const entriesRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { entriesService, objectStorage } = services;
    const security = [{ bearer: [] }];
    const present = (entry: EntryWithAuthor | EntryRecord): z.infer<typeof entrySchema> => toEntryResponse(entry, objectStorage);

    application.get(
        "/rounds/:roundId/entries",
        {
            schema: {
                tags: ["Entries"],
                summary: "List entries. The public sees approved entries only; moderators can filter by status.",
                params: roundParams,
                querystring: paginationQuerySchema.extend({ status: z.enum(EntryStatus).optional() }),
                response: { 200: pageEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await entriesService.list(request.params.roundId, request.query, optionalUser(request));
            return { data: page.data.map(present), meta: page.meta };
        }
    );

    application.get(
        "/rounds/:roundId/entries/:entryId",
        {
            schema: {
                tags: ["Entries"],
                summary: "Get an entry.",
                params: entryParams,
                response: { 200: dataEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: present(await entriesService.get(request.params.roundId, request.params.entryId, optionalUser(request)))
        })
    );

    application.post(
        "/rounds/:roundId/entries",
        {
            preHandler: requireParticipant(Role.Member, services.documentsService),
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Entries"],
                summary: "Propose an entry. Staff submissions are approved immediately.",
                security,
                params: roundParams,
                body: z.object({
                    title: pitchSchema,
                    description: descriptionSchema.default(null),
                    mediaKey: mediaKeySchema.nullable().default(null)
                }),
                response: { 201: dataEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const entry = await entriesService.create(currentUser(request), request.params.roundId, request.body);
            return reply.status(201).send({ data: present(entry) });
        }
    );

    application.patch(
        "/rounds/:roundId/entries/:entryId",
        {
            preHandler: requireRole(Role.Admin),
            schema: {
                tags: ["Entries"],
                summary: "Edit an entry.",
                security,
                params: entryParams,
                body: z
                    .object({
                        title: pitchSchema.optional(),
                        description: descriptionSchema.optional(),
                        mediaKey: mediaKeySchema.nullable().optional()
                    })
                    .refine((body) => Object.keys(body).length > 0, "at least one field is required"),
                response: { 200: dataEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: present(await entriesService.update(actorOf(request), request.params.roundId, request.params.entryId, request.body))
        })
    );

    application.patch(
        "/rounds/:roundId/entries/:entryId/status",
        {
            preHandler: requireRole(Role.Supervisor),
            schema: {
                tags: ["Entries"],
                summary: "Review an entry.",
                security,
                params: entryParams,
                body: z.object({ status: z.enum(EntryStatus) }),
                response: { 200: dataEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: present(
                await entriesService.setStatus(actorOf(request), request.params.roundId, request.params.entryId, request.body.status)
            )
        })
    );

    application.post(
        "/rounds/:roundId/entries/:entryId/reinstate",
        {
            preHandler: requireRole(Role.Admin),
            schema: {
                tags: ["Entries"],
                summary: "Lift a quarantine and approve the entry.",
                security,
                params: entryParams,
                response: { 200: dataEnvelope(entrySchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: present(await entriesService.reinstate(actorOf(request), request.params.roundId, request.params.entryId))
        })
    );

    application.delete(
        "/rounds/:roundId/entries/:entryId",
        {
            preHandler: requireRole(Role.Admin),
            schema: {
                tags: ["Entries"],
                summary: "Delete an entry that has not received votes.",
                security,
                params: entryParams,
                response: { 204: z.null().describe("Deleted"), ...errorResponses }
            }
        },
        async (request, reply) => {
            await entriesService.delete(actorOf(request), request.params.roundId, request.params.entryId);
            return reply.status(204).send(null);
        }
    );

    application.get(
        "/users/me/entries",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Entries"],
                summary: "List all entries submitted by the authenticated user across rounds.",
                security,
                response: { 200: dataEnvelope(z.array(entrySchema)), ...errorResponses }
            }
        },
        async (request) => {
            const user = currentUser(request);
            const rows = await entriesService.listByAuthor(user.id);
            return { data: rows.map(present) };
        }
    );
};

export function toEntryResponse(
    item: EntryWithAuthor | EntryRecord,
    storage: ObjectStorage
): z.infer<typeof entrySchema> {
    const entry = "entry" in item ? item.entry : item;
    const author = "author" in item && item.author !== null ? toUserSummary(item.author) : null;
    return {
        id: entry.id,
        roundId: entry.roundId,
        title: entry.title,
        description: entry.description,
        status: entry.status,
        isQuarantined: entry.isQuarantined,
        mediaUrl: entry.mediaKey === null ? null : storage.getPublicUrl(StorageBucket.Media, entry.mediaKey),
        aiFlags: entry.aiFlags ?? [],
        submittedBy: entry.submittedBy,
        author,
        createdAt: toIso(entry.createdAt),
        updatedAt: toIso(entry.updatedAt)
    };
}
