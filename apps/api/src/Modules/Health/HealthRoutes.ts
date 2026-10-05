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
};
