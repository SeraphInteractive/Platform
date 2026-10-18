import { discordSettingsSchema, updateDiscordSettingsSchema, type DiscordSettingsDto } from "@platform/contracts";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, snowflakeSchema, toIso } from "../../Common/Http/Schemas.js";
import { requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { discordSettings, type DiscordSettingsRecord } from "../../Infrastructure/Database/Schema.js";

function toSettingsResponse(record: DiscordSettingsRecord): DiscordSettingsDto {
    return {
        guildId: record.guildId,
        channels: record.channels ?? {},
        roles: record.roles ?? {},
        forumTags: record.forumTags ?? {},
        notificationCursor: record.notificationCursor ?? null,
        rulesMessageId: record.rulesMessageId ?? null,
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export const discordSettingsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database } = services;
    const security = [{ bearer: [] }];
    // allow service token or staff admins to read and manage discord settings
    const staffOrService = requireRoleOrService(Role.Admin);

    application.get(
        "/discord/settings/:guildId",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Discord"],
                summary: "Get Discord settings for a guild.",
                security,
                params: z.object({ guildId: snowflakeSchema }),
                response: { 200: dataEnvelope(discordSettingsSchema), ...errorResponses }
            }
        },
        async (request) => {
            const [record] = await database
                .select()
                .from(discordSettings)
                .where(eq(discordSettings.guildId, request.params.guildId))
                .limit(1);

            if (record === undefined) {
                return {
                    data: {
                        guildId: request.params.guildId,
                        channels: {},
                        roles: {},
                        forumTags: {},
                        notificationCursor: null,
                        rulesMessageId: null
                    }
                };
            }

            return { data: toSettingsResponse(record) };
        }
    );

    application.put(
        "/discord/settings/:guildId",
        {
            preHandler: staffOrService,
            schema: {
                tags: ["Discord"],
                summary: "Upsert Discord settings for a guild.",
                security,
                params: z.object({ guildId: snowflakeSchema }),
                body: updateDiscordSettingsSchema,
                response: { 200: dataEnvelope(discordSettingsSchema), ...errorResponses }
            }
        },
        async (request) => {
            const updateSet: Partial<typeof discordSettings.$inferInsert> = {
                updatedAt: new Date()
            };
            if (request.body.channels !== undefined) {
                updateSet.channels = request.body.channels;
            }
            if (request.body.roles !== undefined) {
                updateSet.roles = request.body.roles;
            }
            if (request.body.forumTags !== undefined) {
                updateSet.forumTags = request.body.forumTags;
            }
            if (request.body.notificationCursor !== undefined) {
                updateSet.notificationCursor = request.body.notificationCursor;
            }
            if (request.body.rulesMessageId !== undefined) {
                updateSet.rulesMessageId = request.body.rulesMessageId;
            }

            const [saved] = await database
                .insert(discordSettings)
                .values({
                    guildId: request.params.guildId,
                    channels: request.body.channels ?? {},
                    roles: request.body.roles ?? {},
                    forumTags: request.body.forumTags ?? {},
                    notificationCursor: request.body.notificationCursor ?? null,
                    rulesMessageId: request.body.rulesMessageId ?? null
                })
                .onConflictDoUpdate({
                    target: discordSettings.guildId,
                    set: updateSet
                })
                .returning();

            if (saved === undefined) {
                throw new Error("Discord settings insert returned no row.");
            }

            return { data: toSettingsResponse(saved) };
        }
    );
};
