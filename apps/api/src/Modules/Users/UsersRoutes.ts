import { fieldRules } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { NotFoundError } from "../../Common/Errors/ApplicationError.js";
import {
    dataEnvelope,
    errorResponses,
    pageEnvelope,
    paginationQuerySchema,
    snowflakeSchema,
    uuidSchema
} from "../../Common/Http/Schemas.js";
import {
    actorOf,
    currentUser,
    requireRole,
    requireRoleOrService,
    requireService,
    requireUser
} from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { maximumSpecialties, Role, selfSelectableSpecialties, Specialty } from "../../Domain/Roles.js";
import { PresenceStatus } from "../../Infrastructure/Discord/PresenceProvider.js";
import { moderatedUserSchema, toModeratedUserResponse, toUserResponse, userSchema } from "./UserPresenter.js";
import type { UserReference } from "./UsersService.js";

const roleChangeSchema = z.object({
    role: z.enum(Role),
    specialties: z.array(z.enum(Specialty)).max(maximumSpecialties).optional()
});

const ownSpecialtiesSchema = z.object({
    specialties: z.array(z.enum(selfSelectableSpecialties)).max(maximumSpecialties)
});

const blacklistSchema = z.object({ reason: fieldRules.reason.default(null) });

const userIdParams = z.object({ userId: uuidSchema });
const discordIdParams = z.object({ discordId: snowflakeSchema });

export const usersRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { usersService, presenceProvider, authService } = services;
    const security = [{ bearer: [] }];
    const staff = requireRole(Role.Supervisor);
    const staffOrService = requireRoleOrService(Role.Supervisor);
    const moderatorOrService = requireRoleOrService(Role.Moderator);
    const byId = (params: { userId: string }): UserReference => ({ kind: "id", id: params.userId });
    const byDiscord = (params: { discordId: string }): UserReference => ({ kind: "discord", discordId: params.discordId });

    application.get(
        "/users",
        {
            preHandler: moderatorOrService,
            schema: {
                tags: ["Users"],
                summary: "List registered users.",
                security,
                querystring: paginationQuerySchema.extend({ role: z.enum(Role).optional() }),
                response: { 200: pageEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await usersService.list(request.query);
            return { data: page.data.map(toModeratedUserResponse), meta: page.meta };
        }
    );

    application.put(
        "/users/me/terms",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Users"],
                summary: "Accept the current terms of service and privacy policy.",
                security,
                body: z.object({ version: z.string().min(1).max(32) }),
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: toUserResponse(await usersService.acceptTerms(currentUser(request).id, request.body.version)) })
    );

    application.put(
        "/users/me/specialties",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Users"],
                summary: "Choose your own specialties and complete onboarding.",
                security,
                body: ownSpecialtiesSchema,
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: toUserResponse(await usersService.chooseOwnSpecialties(currentUser(request).id, request.body.specialties))
        })
    );

    application.get(
        "/users/presence",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Users"],
                summary: "Look up Discord presence for up to 20 users.",
                querystring: z.object({
                    ids: z
                        .string()
                        .max(20 * 21)
                        .transform((value) => [
                            ...new Set(
                                value
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter((item) => item.length > 0)
                            )
                        ])
                        .pipe(z.array(snowflakeSchema).min(1).max(20))
                }),
                response: { 200: dataEnvelope(z.record(z.string(), z.enum(PresenceStatus))), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.header("Cache-Control", "public, max-age=30");
            return { data: await presenceProvider.getPresence(request.query.ids) };
        }
    );

    application.patch(
        "/users/:userId/role",
        {
            preHandler: staff,
            schema: {
                tags: ["Users"],
                summary: "Change a user's role.",
                security,
                params: userIdParams,
                body: roleChangeSchema,
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.changeRole(actorOf(request), byId(request.params), request.body, false);
            return { data: toUserResponse(user) };
        }
    );

    application.put(
        "/users/by-discord/:discordId/role",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Users"],
                summary: "Set a user's role by Discord ID, creating the user if needed.",
                security,
                params: discordIdParams,
                body: roleChangeSchema.extend({ discordUsername: fieldRules.username.optional() }),
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.changeRole(actorOf(request), byDiscord(request.params), request.body, true);
            return { data: toUserResponse(user) };
        }
    );

    application.put(
        "/users/:userId/blacklist",
        {
            preHandler: staff,
            schema: {
                tags: ["Users"],
                summary: "Blacklist a user from voting.",
                security,
                params: userIdParams,
                body: blacklistSchema,
                response: { 200: dataEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.blacklist(actorOf(request), byId(request.params), request.body.reason);
            return { data: toModeratedUserResponse(user) };
        }
    );

    application.delete(
        "/users/:userId/blacklist",
        {
            preHandler: staff,
            schema: {
                tags: ["Users"],
                summary: "Lift a user's blacklist.",
                security,
                params: userIdParams,
                response: { 200: dataEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.reinstate(actorOf(request), byId(request.params));
            return { data: toModeratedUserResponse(user) };
        }
    );

    application.get(
        "/users/by-discord/:discordId",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Users"],
                summary: "Get a user by Discord ID.",
                security,
                params: discordIdParams,
                response: { 200: dataEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.findByDiscordId(request.params.discordId);
            if (user === null) {
                throw new NotFoundError("User");
            }
            return { data: toModeratedUserResponse(user) };
        }
    );

    application.put(
        "/users/by-discord/:discordId/profile",
        {
            preHandler: requireService(),
            schema: {
                tags: ["Users"],
                summary: "Create or refresh a user from their Discord profile (platform service only).",
                security,
                params: discordIdParams,
                body: z.object({
                    username: fieldRules.username,
                    avatar: z
                        .string()
                        .regex(/^(?:a_)?[a-f0-9]{32}$/u)
                        .nullable()
                        .default(null)
                }),
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await authService.syncUser({
                id: request.params.discordId,
                username: request.body.username,
                avatar: request.body.avatar
            });
            return { data: toUserResponse(user) };
        }
    );

    application.put(
        "/users/by-discord/:discordId/blacklist",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Users"],
                summary: "Blacklist a user by Discord ID.",
                security,
                params: discordIdParams,
                body: blacklistSchema,
                response: { 200: dataEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.blacklist(actorOf(request), byDiscord(request.params), request.body.reason);
            return { data: toModeratedUserResponse(user) };
        }
    );

    application.delete(
        "/users/by-discord/:discordId/blacklist",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Users"],
                summary: "Lift a user's blacklist by Discord ID.",
                security,
                params: discordIdParams,
                response: { 200: dataEnvelope(moderatedUserSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.reinstate(actorOf(request), byDiscord(request.params));
            return { data: toModeratedUserResponse(user) };
        }
    );

    application.post(
        "/users/:userId/promote",
        {
            preHandler: staff,
            schema: {
                tags: ["Users"],
                summary: "Promote a contributor to senior contributor.",
                security,
                params: userIdParams,
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.promoteToSenior(actorOf(request), request.params.userId);
            return { data: toUserResponse(user) };
        }
    );
};
