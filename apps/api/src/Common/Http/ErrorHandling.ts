import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { ApplicationError, ErrorCode, type ErrorDetail } from "../Errors/ApplicationError.js";

const titles: Readonly<Record<number, string>> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    406: "Not Acceptable",
    409: "Conflict",
    413: "Payload Too Large",
    415: "Unsupported Media Type",
    422: "Unprocessable Content",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable"
};

const frameworkCodes: Readonly<Record<number, ErrorCode>> = {
    400: ErrorCode.BadRequest,
    401: ErrorCode.Unauthorized,
    403: ErrorCode.Forbidden,
    404: ErrorCode.NotFound,
    409: ErrorCode.Conflict,
    413: ErrorCode.PayloadTooLarge,
    415: ErrorCode.UnsupportedMediaType,
    429: ErrorCode.TooManyRequests,
    503: ErrorCode.ServiceUnavailable
};

function isFrameworkError(error: FastifyError): boolean {
    const code: unknown = error.code;
    return typeof code === "string" && code.startsWith("FST_");
}

interface ProblemInput {
    readonly status: number;
    readonly code: ErrorCode;
    readonly detail: string;
    readonly errors?: readonly ErrorDetail[];
    readonly headers?: Readonly<Record<string, string>>;
}

export function sendProblem(request: FastifyRequest, reply: FastifyReply, problem: ProblemInput): FastifyReply {
    for (const [name, value] of Object.entries(problem.headers ?? {})) {
        void reply.header(name, value);
    }
    const body = {
        type: `urn:platform:problem:${problem.code.toLowerCase().replace(/_/gu, "-")}`,
        title: titles[problem.status] ?? (problem.status >= 500 ? "Server Error" : "Request Error"),
        status: problem.status,
        detail: problem.detail,
        instance: request.url.split("?")[0] ?? "/",
        code: problem.code,
        traceId: request.id,
        ...(problem.errors !== undefined && problem.errors.length > 0 ? { errors: problem.errors } : {})
    };
    return reply
        .status(problem.status)
        .header("Content-Type", "application/problem+json; charset=utf-8")
        .serializer((payload: unknown) => JSON.stringify(payload))
        .send(body);
}

export function registerErrorHandling(application: FastifyInstance): void {
    application.setNotFoundHandler((request, reply) =>
        sendProblem(request, reply, {
            status: 404,
            code: ErrorCode.RouteNotFound,
            detail: `No route matches ${request.method} ${request.url.split("?")[0] ?? "/"}.`
        })
    );

    application.setErrorHandler((error: FastifyError, request, reply) => {
        if (error instanceof ApplicationError) {
            if (error.statusCode >= 500) {
                request.log.error({ err: error }, "request failed");
            }
            return sendProblem(request, reply, {
                status: error.statusCode,
                code: error.code,
                detail: error.message,
                errors: error.details,
                headers: error.headers
            });
        }

        if (hasZodFastifySchemaValidationErrors(error)) {
            return sendProblem(request, reply, {
                status: 400,
                code: ErrorCode.ValidationFailed,
                detail: "The request did not match the expected schema.",
                errors: error.validation.map((issue) => ({
                    path: [error.validationContext, ...issue.instancePath.split("/").filter((part) => part.length > 0)].join("."),
                    code: issue.keyword,
                    message: issue.message ?? "is invalid"
                }))
            });
        }

        if (isResponseSerializationError(error)) {
            request.log.error({ err: error }, "response did not match its schema");
            return sendProblem(request, reply, { status: 500, code: ErrorCode.InternalError, detail: "An unexpected error occurred." });
        }

        const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;
        if (status >= 500) {
            request.log.error({ err: error }, "unhandled error");
            return sendProblem(request, reply, {
                status: status === 503 ? 503 : 500,
                code: status === 503 ? ErrorCode.ServiceUnavailable : ErrorCode.InternalError,
                detail: status === 503 ? "The service is temporarily unavailable." : "An unexpected error occurred."
            });
        }

        return sendProblem(request, reply, {
            status,
            code: frameworkCodes[status] ?? ErrorCode.BadRequest,
            detail: isFrameworkError(error) ? error.message : (titles[status] ?? "The request could not be processed.")
        });
    });
}
