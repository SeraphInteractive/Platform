import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";

const statusSchema = z.object({ status: z.enum(["ok", "unavailable"]) });

const probeTimeoutMs = 2000;

async function withinTimeout(probe: () => Promise<void>): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
        await Promise.race([
            probe(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(new Error("probe timed out"));
                }, probeTimeoutMs);
            })
        ]);
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

const detailedHealthSchema = z.object({
    status: z.enum(["ok", "degraded", "unavailable"]),
    uptimeSeconds: z.number(),
    database: z.object({
        status: z.enum(["ok", "error"]),
        latencyMs: z.number()
    }),
    redis: z.object({
        status: z.enum(["ok", "error"]),
        latencyMs: z.number()
    }),
    discord: z.object({
        status: z.enum(["ok", "error"]),
        latencyMs: z.number().nullable()
    }),
    timestamp: z.string()
});

async function timedProbe(probe: () => Promise<void>): Promise<{ status: "ok" | "error"; latencyMs: number }> {
    const start = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
        await Promise.race([
            probe(),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    reject(new Error("probe timed out"));
                }, probeTimeoutMs);
            })
        ]);
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;
        return { status: "ok", latencyMs };
    } catch {
        const latencyMs = Math.round((performance.now() - start) * 100) / 100;
        return { status: "error", latencyMs };
    } finally {
        clearTimeout(timer);
    }
}

export const healthRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    application.get(
        "/health/live",
        {
            config: { rateLimit: false },
            logLevel: "warn",
            schema: { tags: ["Health"], summary: "Liveness probe.", response: { 200: statusSchema } }
        },
        async () => ({ status: "ok" as const })
    );

    application.get(
        "/health/ready",
        {
            config: { rateLimit: false },
            logLevel: "warn",
            schema: {
                tags: ["Health"],
                summary: "Readiness probe: PostgreSQL and Redis must be reachable.",
                response: { 200: statusSchema, 503: statusSchema }
            }
        },
        async (_request, reply) => {
            const [database, store] = await Promise.all([
                withinTimeout(services.databasePing),
                withinTimeout(() => services.keyValueStore.ping())
            ]);
            if (database && store) {
                return { status: "ok" as const };
            }
            return reply.status(503).send({ status: "unavailable" as const });
        }
    );

    application.post(
        "/health/bot-heartbeat",
        {
            config: { rateLimit: false },
            logLevel: "warn",
            schema: {
                tags: ["Health"],
                summary: "Heartbeat check-in from the Discord bot.",
                body: z.object({
                    wsPingMs: z.number().min(0).max(60000)
                }),
                response: { 200: z.object({ status: z.literal("ok") }) }
            }
        },
        async (request) => {
            const data = JSON.stringify({
                wsPingMs: request.body.wsPingMs,
                recordedAt: Date.now()
            });
            await services.keyValueStore.set("health:bot-heartbeat", data, 60);
            return { status: "ok" as const };
        }
    );

    application.get(
        "/health/detailed",
        {
            config: { rateLimit: false },
            logLevel: "warn",
            schema: {
                tags: ["Health"],
                summary: "Detailed infrastructure probe with latency breakdown.",
                response: { 200: detailedHealthSchema, 503: detailedHealthSchema }
            }
        },
        async (_request, reply) => {
            const [dbResult, redisResult, botHeartbeatRaw] = await Promise.all([
                timedProbe(services.databasePing),
                timedProbe(() => services.keyValueStore.ping()),
                services.keyValueStore.get("health:bot-heartbeat").catch(() => null)
            ]);

            let discordResult: { status: "ok" | "error"; latencyMs: number | null } = {
                status: "error",
                latencyMs: null
            };

            if (botHeartbeatRaw !== null) {
                try {
                    const parsed = JSON.parse(botHeartbeatRaw) as { wsPingMs?: number; recordedAt?: number };
                    const isFresh = typeof parsed.recordedAt === "number" && Date.now() - parsed.recordedAt < 30_000;
                    if (isFresh && typeof parsed.wsPingMs === "number") {
                        discordResult = { status: "ok", latencyMs: parsed.wsPingMs };
                    }
                } catch {
                    // fall back to error status on corrupted cache value
                }
            }

            const isAllOk = dbResult.status === "ok" && redisResult.status === "ok" && discordResult.status === "ok";
            const isAnyOk = dbResult.status === "ok" || redisResult.status === "ok";
            const overallStatus = isAllOk ? "ok" : isAnyOk ? "degraded" : "unavailable";

            const payload = {
                status: overallStatus as "ok" | "degraded" | "unavailable",
                uptimeSeconds: Math.floor(process.uptime()),
                database: dbResult,
                redis: redisResult,
                discord: discordResult,
                timestamp: new Date().toISOString()
            };

            if (!isAllOk && !isAnyOk) {
                return reply.status(503).send(payload);
            }
            return payload;
        }
    );
};
