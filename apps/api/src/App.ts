import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from "fastify";
import {
    jsonSchemaTransform,
    jsonSchemaTransformObject,
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider
} from "fastify-type-provider-zod";
import { actingUserHeader } from "@platform/contracts";
import { ApplicationError, BadRequestError, ErrorCode, ForbiddenError, UnauthorizedError } from "./Common/Errors/ApplicationError.js";
import type { Principal } from "./Common/Security/Principal.js";
import type { TokenService } from "./Modules/Auth/TokenService.js";
import { registerErrorHandling } from "./Common/Http/ErrorHandling.js";
import type { ServiceContainer } from "./Composition/ServiceContainer.js";
import { Role } from "./Domain/Roles.js";
import { authRoutes } from "./Modules/Auth/AuthRoutes.js";
import { ballotsRoutes } from "./Modules/Ballots/BallotsRoutes.js";
import { entriesRoutes } from "./Modules/Entries/EntriesRoutes.js";
import { healthRoutes } from "./Modules/Health/HealthRoutes.js";
import { notificationRoutes } from "./Modules/Notifications/NotificationRoutes.js";
import { pipelineRoutes } from "./Modules/Pipeline/PipelineRoutes.js";
import { roundsRoutes } from "./Modules/Rounds/RoundsRoutes.js";
import { shotsRoutes } from "./Modules/Shots/ShotsRoutes.js";
import { telemetryRoutes } from "./Modules/Telemetry/TelemetryRoutes.js";
import { threadMapsRoutes } from "./Modules/ThreadMaps/ThreadMapsRoutes.js";
import { uploadsRoutes } from "./Modules/Uploads/UploadsRoutes.js";
import { usersRoutes } from "./Modules/Users/UsersRoutes.js";

export const apiPrefix = "/api/v1";

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/u;
const failedAuthenticationLimit = 30;
const failedAuthenticationWindowSeconds = 60;
const bearerPattern = /^Bearer ([A-Za-z0-9._~+/=-]{1,256})$/iu;

const perMinuteLimits: Readonly<Record<Role | "service" | "anonymous", number>> = {
    anonymous: 60,
    [Role.Voter]: 120,
    [Role.Contributor]: 300,
    [Role.SeniorContributor]: 300,
    [Role.Moderator]: 500,
    [Role.Supervisor]: 500,
    [Role.Admin]: 1000,
    service: 3000
};

function limitFor(request: FastifyRequest): number {
    const principal = request.principal;
    if (principal === null) {
        return perMinuteLimits.anonymous;
    }
    return principal.kind === "service" ? perMinuteLimits.service : perMinuteLimits[principal.user.role];
}

function rateLimitKey(request: FastifyRequest): string {
    const principal = request.principal;
    if (principal === null) {
        return `ip:${request.ip}`;
    }
    return principal.kind === "service" ? "service" : `user:${principal.user.id}`;
}

async function resolveDelegation(request: FastifyRequest, principal: Principal, tokens: TokenService): Promise<Principal> {
    const header = request.headers[actingUserHeader];
    if (header === undefined) {
        return principal;
    }
    if (principal.kind !== "service") {
        throw new ForbiddenError("Only the platform service may act on behalf of users.");
    }
    if (typeof header !== "string" || !/^\d{17,20}$/u.test(header)) {
        throw new BadRequestError("The acting user header must be a Discord user id.");
    }
    const delegated = await tokens.authenticateDelegated(header);
    if (delegated === null) {
        throw new ForbiddenError("This Discord account is not linked to a platform account yet.", ErrorCode.AccountNotLinked);
    }
    return delegated;
}

export async function buildApplication(services: ServiceContainer, logger: FastifyBaseLogger): Promise<FastifyInstance> {
    const { configuration } = services;
    const isProduction = configuration.environment === "production";

    const application = Fastify({
        loggerInstance: logger,
        trustProxy: (_address: string, hop: number): boolean => hop < configuration.server.trustProxyHops,
        bodyLimit: 64 * 1024,
        requestTimeout: 30_000,
        keepAliveTimeout: 72_000,
        return503OnClosing: true,
        requestIdHeader: false,
        genReqId: (request: IncomingMessage): string => {
            const incoming = request.headers["x-request-id"];
            return typeof incoming === "string" && requestIdPattern.test(incoming) ? incoming : randomUUID();
        },
        routerOptions: { ignoreTrailingSlash: true, maxParamLength: 128 },
        ajv: { customOptions: { removeAdditional: false } }
    }).withTypeProvider<ZodTypeProvider>();

    application.setValidatorCompiler(validatorCompiler);
    application.setSerializerCompiler(serializerCompiler);
    application.removeContentTypeParser("text/plain");
    application.decorateRequest("principal", null);

    application.addHook("onRequest", async (request, reply) => {
        void reply.header("X-Request-Id", request.id);
        const header = request.headers.authorization;
        if (header === undefined) {
            return;
        }
        const failureKey = `auth-failures:${request.ip}`;
        const failures = Number((await services.keyValueStore.get(failureKey)) ?? "0");
        if (failures >= failedAuthenticationLimit) {
            throw new ApplicationError(429, ErrorCode.TooManyRequests, "Too many failed authentication attempts.", [], {
                "Retry-After": String(failedAuthenticationWindowSeconds)
            });
        }
        const match = bearerPattern.exec(header);
        const principal = match?.[1] === undefined ? null : await services.tokenService.authenticate(match[1]);
        if (principal === null) {
            await services.keyValueStore.incrementWithin(failureKey, failedAuthenticationWindowSeconds);
            throw new UnauthorizedError("The bearer token is invalid or expired.");
        }
        request.principal = await resolveDelegation(request, principal, services.tokenService);
    });

    registerErrorHandling(application);

    await application.register(helmet, {
        contentSecurityPolicy: {
            useDefaults: false,
            directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] }
        },
        crossOriginResourcePolicy: { policy: "same-site" },
        referrerPolicy: { policy: "no-referrer" },
        hsts: isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: false } : false
    });

    await application.register(cors, {
        origin: [...configuration.security.corsOrigins],
        methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
        allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
        exposedHeaders: ["X-Request-Id", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
        credentials: false,
        maxAge: 600,
        strictPreflight: true
    });

    await application.register(cookie, { parseOptions: { httpOnly: true, sameSite: "lax", secure: configuration.security.secureCookies } });

    await application.register(rateLimit, {
        global: true,
        hook: "preHandler",
        max: (request: FastifyRequest) => limitFor(request),
        timeWindow: "1 minute",
        keyGenerator: rateLimitKey,
        redis: services.rateLimitRedis,
        nameSpace: "platform:rate-limit:",
        skipOnError: false,
        enableDraftSpec: true,
        errorResponseBuilder: (_request, context) =>
            new ApplicationError(429, ErrorCode.TooManyRequests, `Rate limit exceeded. Retry in ${context.after}.`, [], {
                "Retry-After": String(Math.ceil(context.ttl / 1000))
            })
    });

    await application.register(swagger, {
        openapi: {
            openapi: "3.1.0",
            info: { title: "Platform API", version: "2.0.0", description: "Community voting, telemetry and production pipeline API." },
            servers: [{ url: configuration.security.appUrl }],
            components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } }
        },
        transform: jsonSchemaTransform,
        transformObject: jsonSchemaTransformObject
    });

    await application.register(healthRoutes, { services });

    await application.register(
        async (api) => {
            api.get("/openapi.json", { schema: { hide: true } }, async () => application.swagger());
            await api.register(authRoutes, { services });
            await api.register(usersRoutes, { services });
            await api.register(roundsRoutes, { services });
            await api.register(entriesRoutes, { services });
            await api.register(ballotsRoutes, { services });
            await api.register(telemetryRoutes, { services });
            await api.register(shotsRoutes, { services });
            await api.register(uploadsRoutes, { services });
            await api.register(threadMapsRoutes, { services });
            await api.register(pipelineRoutes, { services });
            await api.register(notificationRoutes, { services });
        },
        { prefix: apiPrefix }
    );

    return application;
}
