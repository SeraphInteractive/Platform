import { notificationStreamIdPattern } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApplicationError, BadRequestError, ErrorCode } from "../../Common/Errors/ApplicationError.js";
import { errorResponses } from "../../Common/Http/Schemas.js";
import { requireService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";

const maximumConcurrentStreams = 3;
const blockMs = 20_000;
const batchSize = 100;

export const notificationRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { notificationLog } = services;
    const activeStreams = new Set<() => void>();

    application.addHook("preClose", async () => {
        for (const stop of [...activeStreams]) {
            stop();
        }
    });

    application.get(
        "/notifications/stream",
        {
            preHandler: requireService(),
            config: { rateLimit: false },
            schema: {
                tags: ["Notifications"],
                summary: "Durable server-sent stream of platform notifications. Resume with Last-Event-ID.",
                security: [{ bearer: [] }],
                headers: z.object({ "last-event-id": z.string().max(64).optional() }),
                response: { 200: z.string().describe("text/event-stream"), ...errorResponses }
            }
        },
        async (request, reply) => {
            const resumeFrom = request.headers["last-event-id"];
            if (resumeFrom !== undefined && !notificationStreamIdPattern.test(resumeFrom)) {
                throw new BadRequestError("Last-Event-ID is not a valid stream position.");
            }
            if (activeStreams.size >= maximumConcurrentStreams) {
                throw new ApplicationError(429, ErrorCode.TooManyRequests, "Too many open notification streams.");
            }

            let position = resumeFrom ?? (await notificationLog.latestId());
            const reader = notificationLog.openReader();
            const stream = reply.raw;
            const state = { closed: false };
            const isClosed = (): boolean => state.closed;
            const stop = (): void => {
                if (state.closed) {
                    return;
                }
                state.closed = true;
                activeStreams.delete(stop);
                void reader.close();
                stream.end();
            };
            activeStreams.add(stop);
            stream.on("close", stop);
            stream.on("error", stop);

            reply.hijack();
            stream.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
                "X-Request-Id": request.id
            });
            stream.write("retry: 3000\n\n");

            while (!state.closed) {
                try {
                    const entries = await reader.read(position, batchSize, blockMs);
                    if (isClosed()) {
                        break;
                    }
                    if (entries.length === 0) {
                        stream.write(": keep-alive\n\n");
                        continue;
                    }
                    for (const entry of entries) {
                        stream.write(`id: ${entry.id}\nevent: notification\ndata: ${entry.payload}\n\n`);
                        position = entry.id;
                    }
                } catch (error: unknown) {
                    if (!isClosed()) {
                        request.log.error({ err: error }, "notification stream read failed");
                        stop();
                    }
                }
            }
        }
    );
};
