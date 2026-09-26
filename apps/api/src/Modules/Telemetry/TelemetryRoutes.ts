import { raidTelemetrySchema as telemetrySchema } from "@platform/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ApplicationError, ErrorCode, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, errorResponses, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { currentUser, requireRole } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { raidTelemetry, votingRounds, type RaidTelemetryRecord } from "../../Infrastructure/Database/Schema.js";
import type { RoundEvent, Unsubscribe } from "../../Infrastructure/Events/EventBus.js";

const heartbeatMs = 25_000;

interface StreamSession {
    unsubscribe: Unsubscribe | null;
    heartbeat: NodeJS.Timeout | undefined;
    streaming: boolean;
    closed: boolean;
}
const maximumStreamsPerUser = 5;

function toTelemetryResponse(record: RaidTelemetryRecord): z.infer<typeof telemetrySchema> {
    return {
        id: record.id,
        entryId: record.entryId,
        roundId: record.roundId,
        compositeScore: record.compositeScore,
        severity: record.severity,
        skewRatio: record.skewRatio,
        rankEntropy: record.rankEntropy,
        velocityZScore: record.velocityZScore,
        flags: record.flags,
        breakdown: record.breakdown,
        createdAt: toIso(record.createdAt)
    };
}

export const telemetryRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database, eventBus, configuration } = services;
    const security = [{ bearer: [] }];
    const moderator = requireRole(Role.Moderator);
    const openStreams = new Map<string, number>();
    const shutdownHandlers = new Set<() => void>();

    application.addHook("preClose", async () => {
        for (const shutdown of [...shutdownHandlers]) {
            shutdown();
        }
    });

    const requireRound = async (roundId: string): Promise<void> => {
        const [round] = await database.select({ id: votingRounds.id }).from(votingRounds).where(eq(votingRounds.id, roundId)).limit(1);
        if (round === undefined) {
            throw new NotFoundError("Round");
        }
    };

    application.get(
        "/rounds/:roundId/telemetry",
        {
            preHandler: moderator,
            schema: {
                tags: ["Telemetry"],
                summary: "Latest raid telemetry snapshot for every entry in a round.",
                security,
                params: z.object({ roundId: uuidSchema }),
                response: { 200: dataEnvelope(z.array(telemetrySchema)), ...errorResponses }
            }
        },
        async (request) => {
            await requireRound(request.params.roundId);
            const rows = await database
                .selectDistinctOn([raidTelemetry.entryId])
                .from(raidTelemetry)
                .where(eq(raidTelemetry.roundId, request.params.roundId))
                .orderBy(raidTelemetry.entryId, desc(raidTelemetry.createdAt));
            return { data: rows.map(toTelemetryResponse) };
        }
    );

    application.get(
        "/rounds/:roundId/entries/:entryId/telemetry",
        {
            preHandler: moderator,
            schema: {
                tags: ["Telemetry"],
                summary: "Recent raid telemetry history for an entry.",
                security,
                params: z.object({ roundId: uuidSchema, entryId: uuidSchema }),
                querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
                response: { 200: dataEnvelope(z.array(telemetrySchema)), ...errorResponses }
            }
        },
        async (request) => {
            const rows = await database
                .select()
                .from(raidTelemetry)
                .where(and(eq(raidTelemetry.roundId, request.params.roundId), eq(raidTelemetry.entryId, request.params.entryId)))
                .orderBy(desc(raidTelemetry.createdAt))
                .limit(request.query.limit);
            return { data: rows.map(toTelemetryResponse) };
        }
    );

    application.get(
        "/rounds/:roundId/events",
        {
            preHandler: moderator,
            schema: {
                tags: ["Telemetry"],
                summary: "Server-sent event stream of ballots, raid alerts and finalization for a round.",
                security,
                params: z.object({ roundId: uuidSchema }),
                response: { 200: z.string().describe("text/event-stream"), ...errorResponses }
            }
        },
        async (request, reply) => {
            const { roundId } = request.params;
            await requireRound(roundId);
            const userId = currentUser(request).id;
            if ((openStreams.get(userId) ?? 0) >= maximumStreamsPerUser) {
                throw new ApplicationError(429, ErrorCode.TooManyRequests, "Too many open event streams.");
            }

            const origin = request.headers.origin;
            const headers: Record<string, string> = {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
                "X-Request-Id": request.id
            };
            if (origin !== undefined && configuration.security.corsOrigins.includes(origin)) {
                headers["Access-Control-Allow-Origin"] = origin;
                headers.Vary = "Origin";
            }

            const stream = reply.raw;
            const session: StreamSession = { unsubscribe: null, heartbeat: undefined, streaming: false, closed: false };

            const close = (): void => {
                if (session.closed) {
                    return;
                }
                session.closed = true;
                shutdownHandlers.delete(terminate);
                clearInterval(session.heartbeat);
                const remaining = (openStreams.get(userId) ?? 1) - 1;
                if (remaining <= 0) {
                    openStreams.delete(userId);
                } else {
                    openStreams.set(userId, remaining);
                }
                session.unsubscribe?.().catch((error: unknown) => {
                    request.log.warn({ err: error }, "event stream unsubscribe failed");
                });
            };
            const terminate = (): void => {
                close();
                stream.end();
            };

            openStreams.set(userId, (openStreams.get(userId) ?? 0) + 1);
            shutdownHandlers.add(terminate);
            stream.on("close", close);
            stream.on("error", close);

            try {
                session.unsubscribe = await eventBus.subscribeToRound(roundId, (event: RoundEvent) => {
                    if (session.streaming) {
                        stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
                    }
                });
            } catch (error: unknown) {
                close();
                throw error;
            }

            reply.hijack();
            if (session.closed) {
                await session.unsubscribe();
                return;
            }
            stream.writeHead(200, headers);
            stream.write("retry: 5000\n\n");
            session.streaming = true;
            session.heartbeat = setInterval(() => stream.write(": keep-alive\n\n"), heartbeatMs);
        }
    );
};
