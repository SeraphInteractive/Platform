import { sessionSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { currentUser, requireUser, userPrincipalOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { ForbiddenError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { toUserResponse, userSchema } from "../Users/UserPresenter.js";

const stateCookieTtlSeconds = 10 * 60;
const strictAuthRateLimit = { max: 20, timeWindow: "1 minute" };

export const authRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { authService, tokenService, usersService, configuration } = services;
    const stateCookie = configuration.security.secureCookies ? "__Host-platform_oauth_state" : "platform_oauth_state";
    const cookieOptions = {
        httpOnly: true,
        secure: configuration.security.secureCookies,
        sameSite: "lax" as const,
        path: "/"
    };

    application.get(
        "/auth/discord",
        {
            config: { rateLimit: strictAuthRateLimit },
            schema: {
                tags: ["Auth"],
                summary: "Start a Discord login and redirect to Discord.",
                querystring: z.object({
                    returnTo: z.string().max(2048).optional(),
                    codeChallenge: z
                        .string()
                        .regex(/^[A-Za-z0-9_-]{43}$/u)
                        .describe("base64url(SHA-256(codeVerifier)), RFC 7636 S256")
                }),
                response: { 302: z.null().describe("Redirect to Discord"), ...errorResponses }
            }
        },
        async (request, reply) => {
            const login = await authService.beginLogin(request.query.returnTo, request.query.codeChallenge);
            return reply
                .setCookie(stateCookie, login.state, { ...cookieOptions, maxAge: stateCookieTtlSeconds })
                .header("Cache-Control", "no-store")
                .redirect(login.authorizeUrl, 302);
        }
    );

    application.get(
        "/auth/discord/callback",
        {
            config: { rateLimit: strictAuthRateLimit },
            schema: {
                tags: ["Auth"],
                summary: "Discord OAuth callback. Redirects to the web app with a one-time login code in the URL fragment.",
                querystring: z.object({
                    code: z.string().max(512).optional(),
                    state: z.string().max(128).optional(),
                    error: z.string().max(128).optional()
                }),
                response: { 302: z.null().describe("Redirect to the web app"), ...errorResponses }
            }
        },
        async (request, reply) => {
            const destination = await authService.completeLogin({
                code: request.query.code,
                state: request.query.state,
                error: request.query.error,
                cookieState: request.cookies[stateCookie]
            });
            return reply
                .clearCookie(stateCookie, cookieOptions)
                .header("Cache-Control", "no-store")
                .header("Referrer-Policy", "no-referrer")
                .redirect(destination, 302);
        }
    );

    application.post(
        "/auth/token",
        {
            config: { rateLimit: strictAuthRateLimit },
            schema: {
                tags: ["Auth"],
                summary: "Exchange a one-time login code for a bearer token.",
                body: z.object({ code: z.string().min(1).max(128), codeVerifier: z.string().regex(/^[A-Za-z0-9-._~]{43,128}$/u) }),
                response: { 200: dataEnvelope(sessionSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const session = await authService.exchangeLoginCode(request.body.code, request.body.codeVerifier);
            void reply.header("Cache-Control", "no-store");
            return {
                data: {
                    token: session.token,
                    tokenType: "Bearer" as const,
                    expiresAt: session.expiresAt.toISOString(),
                    user: toUserResponse(session.user)
                }
            };
        }
    );

    application.get(
        "/auth/me",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Auth"],
                summary: "Return the authenticated user.",
                security: [{ bearer: [] }],
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = await usersService.findById(currentUser(request).id);
            if (user === null) {
                throw new NotFoundError("User");
            }
            return { data: toUserResponse(user) };
        }
    );

    application.delete(
        "/auth/session",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Auth"],
                summary: "Revoke the bearer token used for this request.",
                security: [{ bearer: [] }],
                response: { 204: z.null().describe("Session revoked"), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { tokenId } = userPrincipalOf(request);
            if (tokenId === null) {
                throw new ForbiddenError("Delegated requests have no session to revoke.");
            }
            await tokenService.revoke(tokenId);
            return reply.status(204).send(null);
        }
    );
};
