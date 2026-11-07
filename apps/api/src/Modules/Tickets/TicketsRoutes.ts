import {
    addTicketMemberSchema,
    assignTicketSchema,
    bindTicketSchema,
    closeTicketSchema,
    linkTicketMessageSchema,
    openTicketSchema,
    recordTicketMessagesSchema,
    reopenTicketSchema,
    ticketAccessSchema,
    ticketDetailSchema,
    ticketEventSchema,
    ticketListQuerySchema,
    ticketMessageSchema,
    ticketNoteInputSchema,
    ticketReplyInputSchema,
    ticketSchema,
    ticketStageInputSchema,
    ticketSummarySchema,
    type TicketPersonDto
} from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { BadRequestError, ErrorCode } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, errorResponses, pageEnvelope, snowflakeSchema, uuidSchema } from "../../Common/Http/Schemas.js";
import { principalOf, requireRole, requireRoleOrService, requireService, userPrincipalOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import { presentEvent, presentMessage, presentTicket } from "./TicketPresenters.js";
import { everything, type TicketScope } from "./TicketsService.js";

const idParams = z.object({ id: uuidSchema });

export const ticketsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { ticketsService, ticketConfigService } = services;
    const security = [{ bearer: [] }];
    const staff = requireRole(Role.Supervisor);
    const staffOrService = requireRoleOrService(Role.Supervisor);
    const service = requireService();
    const tags = ["Tickets"];

    async function scopeOf(request: FastifyRequest): Promise<TicketScope> {
        const principal = principalOf(request);
        if (principal.kind === "service" || hasAtLeast(principal.user.role, Role.Admin)) {
            return everything;
        }
        return ticketsService.scopeFor(await ticketConfigService.memberRoleIds(principal.user.discordId));
    }

    function actorFrom(request: FastifyRequest, bodyActor: TicketPersonDto | undefined): TicketPersonDto {
        const principal = principalOf(request);
        if (principal.kind === "service") {
            if (bodyActor === undefined) {
                throw new BadRequestError("The platform service must say who is acting.", ErrorCode.ValidationFailed);
            }
            return bodyActor;
        }
        return { discordId: principal.user.discordId, username: principal.user.discordUsername.slice(0, 64) };
    }

    application.get(
        "/tickets/access",
        {
            preHandler: staff,
            schema: {
                tags,
                summary: "Describe which tickets the current user can manage.",
                security,
                response: { 200: dataEnvelope(ticketAccessSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            const scope = await scopeOf(request);
            const { categories } = await ticketConfigService.config();
            const categoryIds = scope.isAll
                ? categories.map((category) => category.record.id)
                : categories
                      .filter(
                          (category) =>
                              scope.categoryIds.includes(category.record.id) ||
                              category.types.some((type) => scope.typeIds.includes(type.record.id))
                      )
                      .map((category) => category.record.id);
            return { data: { canConfigure: hasAtLeast(user.role, Role.Admin), isAllCategories: scope.isAll, categoryIds } };
        }
    );

    application.get(
        "/tickets/summary",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Count open tickets that need attention.",
                security,
                response: { 200: dataEnvelope(ticketSummarySchema), ...errorResponses }
            }
        },
        async (request) => {
            const principal = principalOf(request);
            const discordId = principal.kind === "user" ? principal.user.discordId : null;
            return { data: await ticketsService.summary(await scopeOf(request), discordId) };
        }
    );

    application.get(
        "/tickets",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "List tickets by latest activity.",
                security,
                querystring: ticketListQuerySchema,
                response: { 200: pageEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await ticketsService.list(request.query, await scopeOf(request));
            return { data: page.data.map(presentTicket), meta: page.meta };
        }
    );

    application.get(
        "/tickets/open-threads",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "List the threads of open tickets.",
                security,
                response: { 200: dataEnvelope(z.array(z.object({ ticketId: uuidSchema, threadId: snowflakeSchema }))), ...errorResponses }
            }
        },
        async () => ({ data: await ticketsService.openThreadIds() })
    );

    application.get(
        "/tickets/by-thread/:threadId",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Find the ticket bound to a Discord thread.",
                security,
                params: z.object({ threadId: snowflakeSchema }),
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentTicket(await ticketsService.getByThread(request.params.threadId)) })
    );

    application.get(
        "/tickets/:id",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Get a ticket.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentTicket(await ticketsService.get(request.params.id, await scopeOf(request))) })
    );

    application.get(
        "/tickets/:id/detail",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Get a ticket with its timeline and conversation.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(ticketDetailSchema), ...errorResponses }
            }
        },
        async (request) => {
            const [detail, directory] = await Promise.all([
                ticketsService.detail(request.params.id, await scopeOf(request)),
                ticketConfigService.directory()
            ]);
            return {
                data: {
                    ticket: presentTicket(detail.ticket),
                    events: detail.events.map(presentEvent),
                    messages: detail.messages.map(presentMessage),
                    guildId: directory.guildId
                }
            };
        }
    );

    application.post(
        "/tickets",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Open a ticket on behalf of a Discord member.",
                security,
                body: openTicketSchema,
                response: { 201: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request, reply) => reply.status(201).send({ data: presentTicket(await ticketsService.open(request.body)) })
    );

    application.patch(
        "/tickets/:id",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Record the Discord messages and thread of a ticket.",
                security,
                params: idParams,
                body: bindTicketSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentTicket(await ticketsService.bind(request.params.id, request.body)) })
    );

    application.post(
        "/tickets/:id/stage",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Move an application to its next review stage.",
                security,
                params: idParams,
                body: ticketStageInputSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { actor, ...input } = request.body;
            const saved = await ticketsService.setStage(request.params.id, input, actorFrom(request, actor), await scopeOf(request));
            return { data: presentTicket(saved) };
        }
    );

    application.post(
        "/tickets/:id/close",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Close a ticket.",
                security,
                params: idParams,
                body: closeTicketSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { actor, ...input } = request.body;
            const saved = await ticketsService.close(request.params.id, input, actorFrom(request, actor), await scopeOf(request));
            return { data: presentTicket(saved) };
        }
    );

    application.post(
        "/tickets/:id/reopen",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Reopen a closed ticket.",
                security,
                params: idParams,
                body: reopenTicketSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { actor, ...input } = request.body;
            const saved = await ticketsService.reopen(request.params.id, input, actorFrom(request, actor), await scopeOf(request));
            return { data: presentTicket(saved) };
        }
    );

    application.post(
        "/tickets/:id/assign",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Assign a ticket to a staff member, or clear the assignment.",
                security,
                params: idParams,
                body: assignTicketSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { actor, ...input } = request.body;
            const saved = await ticketsService.assign(request.params.id, input, actorFrom(request, actor), await scopeOf(request));
            return { data: presentTicket(saved) };
        }
    );

    application.post(
        "/tickets/:id/members",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Add a server member to the ticket thread.",
                security,
                params: idParams,
                body: addTicketMemberSchema,
                response: { 200: dataEnvelope(ticketSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { actor, ...input } = request.body;
            const saved = await ticketsService.addMember(request.params.id, input, actorFrom(request, actor), await scopeOf(request));
            return { data: presentTicket(saved) };
        }
    );

    application.post(
        "/tickets/:id/notes",
        {
            preHandler: staffOrService,
            schema: {
                tags,
                summary: "Add a staff-only note to the ticket timeline.",
                security,
                params: idParams,
                body: ticketNoteInputSchema,
                response: { 201: dataEnvelope(ticketEventSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const event = await ticketsService.note(
                request.params.id,
                request.body.content,
                actorFrom(request, request.body.actor),
                await scopeOf(request)
            );
            return reply.status(201).send({ data: presentEvent(event) });
        }
    );

    application.post(
        "/tickets/:id/replies",
        {
            preHandler: staff,
            schema: {
                tags,
                summary: "Reply in the ticket thread from the web.",
                security,
                params: idParams,
                body: ticketReplyInputSchema,
                response: { 201: dataEnvelope(ticketMessageSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { user } = userPrincipalOf(request);
            const directory = await ticketConfigService.directory();
            const avatarUrl = directory.members.find((member) => member.id === user.discordId)?.avatarUrl ?? null;
            const message = await ticketsService.reply(
                request.params.id,
                request.body.content,
                actorFrom(request, undefined),
                avatarUrl,
                await scopeOf(request)
            );
            return reply.status(201).send({ data: presentMessage(message) });
        }
    );

    application.put(
        "/tickets/:id/replies/:messageId/link",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Link a web reply to the Discord message that carried it.",
                security,
                params: z.object({ id: uuidSchema, messageId: uuidSchema }),
                body: linkTicketMessageSchema,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await ticketsService.linkMessage(request.params.id, request.params.messageId, request.body.discordMessageId);
            return reply.status(204).send(null);
        }
    );

    application.put(
        "/tickets/:id/messages",
        {
            preHandler: service,
            bodyLimit: 1024 * 1024,
            schema: {
                tags,
                summary: "Record messages posted in the ticket thread.",
                security,
                params: idParams,
                body: recordTicketMessagesSchema,
                response: { 200: dataEnvelope(z.object({ recorded: z.number().int() })), ...errorResponses }
            }
        },
        async (request) => ({ data: { recorded: await ticketsService.recordMessages(request.params.id, request.body.messages) } })
    );

    application.delete(
        "/tickets/:id/messages/:discordMessageId",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Mark a thread message as deleted.",
                security,
                params: z.object({ id: uuidSchema, discordMessageId: snowflakeSchema }),
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await ticketsService.deleteMessage(request.params.id, request.params.discordMessageId);
            return reply.status(204).send(null);
        }
    );
};
