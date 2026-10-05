import { shotThreadMapSchema as threadMapSchema } from "@platform/contracts";
import { asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ConflictError, NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, errorResponses, snowflakeSchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { isForeignKeyViolation, isUniqueViolation } from "../../Infrastructure/Database/Database.js";
import { shotThreadMaps, type ShotThreadMapRecord } from "../../Infrastructure/Database/Schema.js";

function toThreadMapResponse(map: ShotThreadMapRecord): z.infer<typeof threadMapSchema> {
    return { shotId: map.shotId, discordThreadId: map.discordThreadId, updatedAt: toIso(map.updatedAt) };
}

export const threadMapsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database } = services;
    const security = [{ bearer: [] }];
    const writer = requireRoleOrService(Role.Supervisor);

    application.get(
        "/shot-thread-maps",
        {
            schema: {
                tags: ["Shot threads"],
                summary: "All shot to Discord thread bindings.",
                response: { 200: dataEnvelope(z.array(threadMapSchema)), ...errorResponses }
            }
        },
        async () => {
            const maps = await database.select().from(shotThreadMaps).orderBy(asc(shotThreadMaps.shotId));
            return { data: maps.map(toThreadMapResponse) };
        }
    );

    application.get(
        "/shot-thread-maps/by-thread/:threadId",
        {
            schema: {
                tags: ["Shot threads"],
                summary: "Resolve the shot bound to a Discord thread.",
                params: z.object({ threadId: snowflakeSchema }),
                response: { 200: dataEnvelope(threadMapSchema), ...errorResponses }
            }
        },
        async (request) => {
            const [map] = await database
                .select()
                .from(shotThreadMaps)
                .where(eq(shotThreadMaps.discordThreadId, request.params.threadId))
                .limit(1);
            if (map === undefined) {
                throw new NotFoundError("Thread binding");
            }
            return { data: toThreadMapResponse(map) };
        }
    );

    application.put(
        "/shot-thread-maps/:shotId",
        {
            preHandler: writer,
            schema: {
                tags: ["Shot threads"],
                summary: "Bind a shot to a Discord thread (idempotent upsert).",
                security,
                params: z.object({ shotId: uuidSchema }),
                body: z.object({ discordThreadId: snowflakeSchema }),
                response: { 200: dataEnvelope(threadMapSchema), ...errorResponses }
            }
        },
        async (request) => {
            try {
                const [map] = await database
                    .insert(shotThreadMaps)
                    .values({ shotId: request.params.shotId, discordThreadId: request.body.discordThreadId })
                    .onConflictDoUpdate({
                        target: shotThreadMaps.shotId,
                        set: { discordThreadId: request.body.discordThreadId, updatedAt: new Date() }
                    })
                    .returning();
                if (map === undefined) {
                    throw new NotFoundError("Shot");
                }
                return { data: toThreadMapResponse(map) };
            } catch (error: unknown) {
                if (isForeignKeyViolation(error)) {
                    throw new NotFoundError("Shot");
                }
                if (isUniqueViolation(error)) {
                    throw new ConflictError("That Discord thread is already bound to another shot.");
                }
                throw error;
            }
        }
    );

    application.delete(
        "/shot-thread-maps/:shotId",
        {
            preHandler: writer,
            schema: {
                tags: ["Shot threads"],
                summary: "Remove a shot's thread binding.",
                security,
                params: z.object({ shotId: uuidSchema }),
                response: { 204: z.null().describe("Removed"), ...errorResponses }
            }
        },
        async (request, reply) => {
            await database.delete(shotThreadMaps).where(eq(shotThreadMaps.shotId, request.params.shotId));
            return reply.status(204).send(null);
        }
    );
};
