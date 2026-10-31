import {
    bindTicketHubSchema,
    createTicketCategorySchema,
    createTicketHubSchema,
    createTicketTypeSchema,
    departmentDeskSchema,
    discordDirectorySchema,
    ensureDepartmentDeskSchema,
    publicPositionsSchema,
    ticketCategorySchema,
    ticketConfigSchema,
    ticketHubSchema,
    ticketSettingsSchema,
    ticketTypeSchema,
    updateDiscordDirectorySchema,
    updateTicketCategorySchema,
    updateTicketHubSchema,
    updateTicketSettingsSchema,
    updateTicketTypeSchema,
    type TicketCategoryDto,
    type TicketTypeDto
} from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, uuidSchema } from "../../Common/Http/Schemas.js";
import { actorOf, requireRole, requireRoleOrService, requireService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { personOfActor } from "../../Infrastructure/Notifications/Notification.js";
import { presentCategory, presentHub, presentSettings, presentType } from "./TicketPresenters.js";

const idParams = z.object({ id: uuidSchema });
const directoryBodyLimit = 4 * 1024 * 1024;

export const ticketConfigRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { ticketConfigService } = services;
    const security = [{ bearer: [] }];
    const admin = requireRole(Role.Admin);
    const staffOrService = requireRoleOrService(Role.Supervisor);
    const service = requireService();
    const tags = ["Tickets"];

    async function findCategory(id: string): Promise<TicketCategoryDto> {
        const view = (await ticketConfigService.config()).categories.find((category) => category.record.id === id);
        if (view === undefined) {
            throw new Error("Saved ticket category disappeared.");
        }
        return presentCategory(view);
    }

    async function findType(id: string): Promise<TicketTypeDto> {
        const view = (await ticketConfigService.config()).categories
            .flatMap((category) => category.types)
            .find((type) => type.record.id === id);
        if (view === undefined) {
            throw new Error("Saved ticket type disappeared.");
        }
        return presentType(view);
    }

    application.get(
        "/tickets/config",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Get the ticket desk configuration.",
                security,
                response: { 200: dataEnvelope(ticketConfigSchema), ...errorResponses }
            }
        },
        async () => {
            const config = await ticketConfigService.config();
            return {
                data: {
                    settings: presentSettings(config.settings),
                    hubs: config.hubs.map(presentHub),
                    categories: config.categories.map(presentCategory)
                }
            };
        }
    );

    application.put(
        "/tickets/settings",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Update logging and ticket limits.",
                security,
                body: updateTicketSettingsSchema,
                response: { 200: dataEnvelope(ticketSettingsSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: presentSettings(await ticketConfigService.updateSettings(request.body, personOfActor(actorOf(request))))
        })
    );

    application.post(
        "/tickets/hubs",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Create a ticket hub.",
                security,
                body: createTicketHubSchema,
                response: { 201: dataEnvelope(ticketHubSchema), ...errorResponses }
            }
        },
        async (request, reply) =>
            reply.status(201).send({ data: presentHub(await ticketConfigService.createHub(request.body, personOfActor(actorOf(request)))) })
    );

    application.patch(
        "/tickets/hubs/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Update a ticket hub.",
                security,
                params: idParams,
                body: updateTicketHubSchema,
                response: { 200: dataEnvelope(ticketHubSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: presentHub(await ticketConfigService.updateHub(request.params.id, request.body, personOfActor(actorOf(request))))
        })
    );

    application.put(
        "/tickets/hubs/:id/message",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Record the Discord message that shows a hub.",
                security,
                params: idParams,
                body: bindTicketHubSchema,
                response: { 200: dataEnvelope(ticketHubSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentHub(await ticketConfigService.bindHub(request.params.id, request.body.messageId)) })
    );

    application.delete(
        "/tickets/hubs/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Delete a ticket hub and its Discord message.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await ticketConfigService.deleteHub(request.params.id, personOfActor(actorOf(request)));
            return reply.status(204).send(null);
        }
    );

    application.post(
        "/tickets/categories",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Create a ticket category.",
                security,
                body: createTicketCategorySchema,
                response: { 201: dataEnvelope(ticketCategorySchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const saved = await ticketConfigService.createCategory(request.body, personOfActor(actorOf(request)));
            return reply.status(201).send({ data: await findCategory(saved.id) });
        }
    );

    application.patch(
        "/tickets/categories/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Update a ticket category.",
                security,
                params: idParams,
                body: updateTicketCategorySchema,
                response: { 200: dataEnvelope(ticketCategorySchema), ...errorResponses }
            }
        },
        async (request) => {
            const saved = await ticketConfigService.updateCategory(request.params.id, request.body, personOfActor(actorOf(request)));
            return { data: await findCategory(saved.id) };
        }
    );

    application.delete(
        "/tickets/categories/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Delete a ticket category and its types. Past tickets are kept.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await ticketConfigService.deleteCategory(request.params.id, personOfActor(actorOf(request)));
            return reply.status(204).send(null);
        }
    );

    application.post(
        "/tickets/types",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Create a ticket type.",
                security,
                body: createTicketTypeSchema,
                response: { 201: dataEnvelope(ticketTypeSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const saved = await ticketConfigService.createType(request.body, personOfActor(actorOf(request)));
            return reply.status(201).send({ data: await findType(saved.id) });
        }
    );

    application.patch(
        "/tickets/types/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Update a ticket type.",
                security,
                params: idParams,
                body: updateTicketTypeSchema,
                response: { 200: dataEnvelope(ticketTypeSchema), ...errorResponses }
            }
        },
        async (request) => {
            const saved = await ticketConfigService.updateType(request.params.id, request.body, personOfActor(actorOf(request)));
            return { data: await findType(saved.id) };
        }
    );

    application.delete(
        "/tickets/types/:id",
        {
            preHandler: admin,
            schema: {
                tags,
                summary: "Delete a ticket type. Past tickets are kept.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await ticketConfigService.deleteType(request.params.id, personOfActor(actorOf(request)));
            return reply.status(204).send(null);
        }
    );

    application.put(
        "/tickets/departments/:departmentId/desk",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Create a department's ticket desk and apply hub if missing. Existing settings are kept.",
                security,
                params: z.object({ departmentId: uuidSchema }),
                body: ensureDepartmentDeskSchema,
                response: { 200: dataEnvelope(departmentDeskSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: await ticketConfigService.ensureDepartmentDesk(request.params.departmentId, request.body, personOfActor(actorOf(request)))
        })
    );

    application.get(
        "/positions",
        {
            schema: {
                tags,
                summary: "List the positions that take applications, with their listings.",
                response: { 200: dataEnvelope(publicPositionsSchema), ...errorResponses }
            }
        },
        async () => ({ data: await ticketConfigService.publicPositions() })
    );

    application.get(
        "/discord/directory",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Discord"],
                summary: "Get the channels, roles and members the bot last saw in the server.",
                security,
                response: { 200: dataEnvelope(discordDirectorySchema), ...errorResponses }
            }
        },
        async () => ({ data: await ticketConfigService.directory() })
    );

    application.put(
        "/discord/directory",
        {
            preHandler: service,
            bodyLimit: directoryBodyLimit,
            schema: {
                tags: ["Discord"],
                summary: "Replace the server directory.",
                security,
                body: updateDiscordDirectorySchema,
                response: { 200: dataEnvelope(discordDirectorySchema), ...errorResponses }
            }
        },
        async (request) => ({ data: await ticketConfigService.replaceDirectory(request.body) })
    );
};
