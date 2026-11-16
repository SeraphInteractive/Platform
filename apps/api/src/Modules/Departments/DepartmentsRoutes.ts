import { departmentDefinitions, departmentSchema, type DepartmentSlug } from "@platform/contracts";
import { asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { NotFoundError } from "../../Common/Errors/ApplicationError.js";
import { dataEnvelope, discordWebhookUrlSchema, errorResponses, snowflakeSchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { hasAtLeast, Role } from "../../Domain/Roles.js";
import {
    departmentDiscordMaps,
    departments,
    type DepartmentDiscordMapRecord,
    type DepartmentRecord
} from "../../Infrastructure/Database/Schema.js";

function canReadWebhooks(request: { principal: { kind: string; user?: { role: Role } } | null }): boolean {
    if (request.principal?.kind === "service") {
        return true;
    }
    if (request.principal?.kind === "user" && request.principal.user) {
        return hasAtLeast(request.principal.user.role, Role.Supervisor);
    }
    return false;
}

function toDepartmentResponse(
    dept: DepartmentRecord,
    map?: DepartmentDiscordMapRecord | null,
    includeWebhooks = false
): z.infer<typeof departmentSchema> {
    const def = departmentDefinitions.find((d) => d.slug === (dept.slug as DepartmentSlug));
    const shotTypes = dept.shotTypes.length > 0 ? dept.shotTypes : (def?.shotTypes ?? []);
    return {
        id: dept.id,
        name: dept.name,
        slug: dept.slug as DepartmentSlug,
        supervisorSpecialties: dept.supervisorSpecialties,
        contributorSpecialties: dept.contributorSpecialties,
        shotTypes: [...shotTypes],
        discordCategoryId: map?.discordCategoryId ?? null,
        discordForumId: map?.discordForumId ?? null,
        discordChatChannelId: map?.discordChatChannelId ?? null,
        discordInfoChannelId: map?.discordInfoChannelId ?? null,
        // redact webhook credentials from unauthenticated/contributor responses
        discordInfoWebhookUrl: includeWebhooks ? (map?.discordInfoWebhookUrl ?? null) : null,
        discordLogsChannelId: map?.discordLogsChannelId ?? null,
        // redact webhook credentials from unauthenticated/contributor responses
        discordLogsWebhookUrl: includeWebhooks ? (map?.discordLogsWebhookUrl ?? null) : null,
        discordApplyChannelId: map?.discordApplyChannelId ?? null,
        createdAt: toIso(dept.createdAt),
        updatedAt: toIso(dept.updatedAt)
    };
}

export const departmentsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database } = services;
    const security = [{ bearer: [] }];
    const supervisorOrService = requireRoleOrService(Role.Supervisor);

    application.get(
        "/departments",
        {
            schema: {
                tags: ["Departments"],
                summary: "List all active studio departments and their Discord bindings.",
                response: { 200: dataEnvelope(z.array(departmentSchema)), ...errorResponses }
            }
        },
        async (request) => {
            const includeWebhooks = canReadWebhooks(request);
            const rows = await database
                .select({
                    dept: departments,
                    map: departmentDiscordMaps
                })
                .from(departments)
                .leftJoin(departmentDiscordMaps, eq(departments.id, departmentDiscordMaps.departmentId))
                .orderBy(asc(departments.name));

            return {
                data: rows.map((row) => toDepartmentResponse(row.dept, row.map, includeWebhooks))
            };
        }
    );

    application.get(
        "/departments/:idOrSlug",
        {
            schema: {
                tags: ["Departments"],
                summary: "Get a specific department by ID or slug.",
                params: z.object({ idOrSlug: z.string().min(1) }),
                response: { 200: dataEnvelope(departmentSchema), ...errorResponses }
            }
        },
        async (request) => {
            const includeWebhooks = canReadWebhooks(request);
            const identifier = request.params.idOrSlug.trim();
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(identifier);

            const [row] = await database
                .select({
                    dept: departments,
                    map: departmentDiscordMaps
                })
                .from(departments)
                .leftJoin(departmentDiscordMaps, eq(departments.id, departmentDiscordMaps.departmentId))
                .where(isUuid ? eq(departments.id, identifier) : eq(departments.slug, identifier))
                .limit(1);

            if (row === undefined) {
                throw new NotFoundError("Department");
            }

            return {
                data: toDepartmentResponse(row.dept, row.map, includeWebhooks)
            };
        }
    );

    application.put(
        "/departments/:departmentId/discord-map",
        {
            preHandler: supervisorOrService,
            schema: {
                tags: ["Departments"],
                summary: "Bind or update Discord category, forum, and chat channels for a department.",
                security,
                params: z.object({ departmentId: uuidSchema }),
                body: z.object({
                    discordCategoryId: snowflakeSchema,
                    discordForumId: snowflakeSchema,
                    discordChatChannelId: snowflakeSchema.nullable().optional(),
                    discordInfoChannelId: snowflakeSchema.nullable().optional(),
                    discordInfoWebhookUrl: discordWebhookUrlSchema.nullable().optional(),
                    discordLogsChannelId: snowflakeSchema.nullable().optional(),
                    discordLogsWebhookUrl: discordWebhookUrlSchema.nullable().optional(),
                    discordApplyChannelId: snowflakeSchema.nullable().optional()
                }),
                response: { 200: dataEnvelope(departmentSchema), ...errorResponses }
            }
        },
        async (request) => {
            const { departmentId } = request.params;
            const {
                discordCategoryId,
                discordForumId,
                discordChatChannelId,
                discordInfoChannelId,
                discordInfoWebhookUrl,
                discordLogsChannelId,
                discordLogsWebhookUrl,
                discordApplyChannelId
            } = request.body;

            const [dept] = await database.select().from(departments).where(eq(departments.id, departmentId)).limit(1);

            if (dept === undefined) {
                throw new NotFoundError("Department");
            }

            const [map] = await database
                .insert(departmentDiscordMaps)
                .values({
                    departmentId,
                    discordCategoryId,
                    discordForumId,
                    discordChatChannelId: discordChatChannelId ?? null,
                    discordInfoChannelId: discordInfoChannelId ?? null,
                    discordInfoWebhookUrl: discordInfoWebhookUrl ?? null,
                    discordLogsChannelId: discordLogsChannelId ?? null,
                    discordLogsWebhookUrl: discordLogsWebhookUrl ?? null,
                    discordApplyChannelId: discordApplyChannelId ?? null
                })
                .onConflictDoUpdate({
                    target: departmentDiscordMaps.departmentId,
                    set: {
                        discordCategoryId,
                        discordForumId,
                        discordChatChannelId: discordChatChannelId ?? null,
                        discordInfoChannelId: discordInfoChannelId ?? null,
                        discordInfoWebhookUrl: discordInfoWebhookUrl ?? null,
                        discordLogsChannelId: discordLogsChannelId ?? null,
                        discordLogsWebhookUrl: discordLogsWebhookUrl ?? null,
                        discordApplyChannelId: discordApplyChannelId ?? null,
                        updatedAt: new Date()
                    }
                })
                .returning();

            return {
                data: toDepartmentResponse(dept, map, true)
            };
        }
    );
};
