import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { ErrorCode, ForbiddenError, UnauthorizedError } from "../Errors/ApplicationError.js";
import { hasAtLeast, type Role } from "../../Domain/Roles.js";
import type { LegalAcceptance } from "../../Modules/Documents/DocumentsService.js";
import {
    actorFor,
    userActorFor,
    type Actor,
    type AuthenticatedUser,
    type Principal,
    type UserActor,
    type UserPrincipal
} from "./Principal.js";

declare module "fastify" {
    interface FastifyRequest {
        principal: Principal | null;
    }
}

export function requireUser(): preHandlerAsyncHookHandler {
    return async function (request: FastifyRequest): Promise<void> {
        userPrincipalOf(request);
    };
}

export function requireRole(role: Role): preHandlerAsyncHookHandler {
    return async function (request: FastifyRequest): Promise<void> {
        const { user } = userPrincipalOf(request);
        if (!hasAtLeast(user.role, role)) {
            throw new ForbiddenError(`This action requires the ${role} role or higher.`, ErrorCode.InsufficientRole);
        }
    };
}

export function requireAcceptedTerms(legal: LegalAcceptance): preHandlerAsyncHookHandler {
    return async function (request: FastifyRequest): Promise<void> {
        const { user } = userPrincipalOf(request);
        if (user.termsVersion !== (await legal.currentAcceptanceVersion())) {
            throw new ForbiddenError("Accept the current terms of service first.", ErrorCode.TermsNotAccepted);
        }
    };
}

export function requireParticipant(role: Role, legal: LegalAcceptance): preHandlerAsyncHookHandler {
    return async function (request: FastifyRequest): Promise<void> {
        const { user } = userPrincipalOf(request);
        if (user.termsVersion !== (await legal.currentAcceptanceVersion())) {
            throw new ForbiddenError("Accept the current terms of service first.", ErrorCode.TermsNotAccepted);
        }
        if (!user.isVerified) {
            throw new ForbiddenError("Verify your email to take part.", ErrorCode.VerificationRequired);
        }
        if (!hasAtLeast(user.role, role)) {
            throw new ForbiddenError(`This action requires the ${role} role or higher.`, ErrorCode.InsufficientRole);
        }
    };
}

export function requireRoleOrService(role: Role): preHandlerAsyncHookHandler {
    const userCheck = requireRole(role);
    return async function (this: unknown, request: FastifyRequest, reply: FastifyReply): Promise<void> {
        if (request.principal?.kind === "service") {
            return;
        }
        await userCheck.call(this as never, request, reply);
    };
}

export function principalOf(request: FastifyRequest): Principal {
    if (request.principal === null) {
        throw new UnauthorizedError();
    }
    return request.principal;
}

export function userPrincipalOf(request: FastifyRequest): UserPrincipal {
    const principal = principalOf(request);
    if (principal.kind !== "user") {
        throw new ForbiddenError("This action requires a user account.");
    }
    return principal;
}

export function currentUser(request: FastifyRequest): AuthenticatedUser {
    return userPrincipalOf(request).user;
}

export function optionalUser(request: FastifyRequest): AuthenticatedUser | null {
    return request.principal?.kind === "user" ? request.principal.user : null;
}

export function actorOf(request: FastifyRequest): Actor {
    return actorFor(principalOf(request));
}

export function userActorOf(request: FastifyRequest): UserActor {
    return userActorFor(userPrincipalOf(request));
}

export function requireService(): preHandlerAsyncHookHandler {
    return async function (request: FastifyRequest): Promise<void> {
        if (principalOf(request).kind !== "service") {
            throw new ForbiddenError("This endpoint is reserved for the platform service.");
        }
    };
}
