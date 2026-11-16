import {
    userModerationRecordSchema,
    updateUserModerationRecordSchema,
    type UserModerationRecordDto,
    type ApologyRecordDto
} from "@platform/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, snowflakeSchema, toIso } from "../../Common/Http/Schemas.js";
import { currentUser, requireRoleOrService, requireUser } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { discordModerationRecords, type DiscordModerationRecord } from "../../Infrastructure/Database/Schema.js";

function toRecordResponse(record: DiscordModerationRecord): UserModerationRecordDto {
    return {
        userId: record.userId,
        offenceLevel: record.offenceLevel,
        stageWarnings: record.stageWarnings,
        infractions: record.infractions ?? [],
        timeouts: record.timeouts ?? [],
        apology: {
            status: (record.apologyStatus as ApologyRecordDto["status"]) ?? "none",
            text: record.apologyText ?? null,
            submittedAt: record.apologySubmittedAt ? record.apologySubmittedAt.toISOString() : null,
            reviewedBy: record.apologyReviewedBy ?? null,
            reviewedAt: record.apologyReviewedAt ? record.apologyReviewedAt.toISOString() : null
        },
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

export const discordModerationRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database } = services;
    const security = [{ bearer: [] }];
    // allow service token or supervisors to read and record infractions
    const supervisorOrService = requireRoleOrService(Role.Supervisor);

    application.get(
        "/discord/moderation/me",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Discord"],
                summary: "Get current user moderation record and warning levels.",
                security,
                response: { 200: dataEnvelope(userModerationRecordSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = currentUser(request);
            if (!user.discordId) {
                const defaultRecord: UserModerationRecordDto = {
                    userId: "",
                    offenceLevel: 0,
                    stageWarnings: 0,
                    infractions: [],
                    timeouts: [],
                    apology: { status: "none", text: null, submittedAt: null }
                };
                return { data: defaultRecord };
            }

            const [record] = await database
                .select()
                .from(discordModerationRecords)
                .where(eq(discordModerationRecords.userId, user.discordId))
                .limit(1);

            if (record === undefined) {
                const defaultRecord: UserModerationRecordDto = {
                    userId: user.discordId,
                    offenceLevel: 0,
                    stageWarnings: 0,
                    infractions: [],
                    timeouts: [],
                    apology: { status: "none", text: null, submittedAt: null }
                };
                return { data: defaultRecord };
            }

            return { data: toRecordResponse(record) };
        }
    );

    application.get(
        "/discord/moderation",
        {
            preHandler: supervisorOrService,
            schema: {
                tags: ["Discord"],
                summary: "List all user moderation records.",
                security,
                querystring: z.object({
                    offenceLevel: z.coerce.number().int().optional(),
                    apologyStatus: z.string().optional()
                }),
                response: { 200: dataEnvelope(z.array(userModerationRecordSchema)), ...errorResponses }
            }
        },
        async (request) => {
            const conditions = [];
            if (request.query.offenceLevel !== undefined) {
                conditions.push(eq(discordModerationRecords.offenceLevel, request.query.offenceLevel));
            }
            if (request.query.apologyStatus !== undefined) {
                conditions.push(eq(discordModerationRecords.apologyStatus, request.query.apologyStatus));
            }

            const query = database.select().from(discordModerationRecords).orderBy(desc(discordModerationRecords.updatedAt));

            const records = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
            return { data: records.map(toRecordResponse) };
        }
    );

    application.get(
        "/discord/moderation/:userId",
        {
            preHandler: supervisorOrService,
            schema: {
                tags: ["Discord"],
                summary: "Get moderation record for a user.",
                security,
                params: z.object({ userId: snowflakeSchema }),
                response: { 200: dataEnvelope(userModerationRecordSchema), ...errorResponses }
            }
        },
        async (request) => {
            const [record] = await database
                .select()
                .from(discordModerationRecords)
                .where(eq(discordModerationRecords.userId, request.params.userId))
                .limit(1);

            if (record === undefined) {
                const defaultRecord: UserModerationRecordDto = {
                    userId: request.params.userId,
                    offenceLevel: 0,
                    stageWarnings: 0,
                    infractions: [],
                    timeouts: [],
                    apology: { status: "none", text: null, submittedAt: null }
                };
                return { data: defaultRecord };
            }

            return { data: toRecordResponse(record) };
        }
    );

    application.put(
        "/discord/moderation/:userId",
        {
            preHandler: supervisorOrService,
            schema: {
                tags: ["Discord"],
                summary: "Upsert moderation record for a user.",
                security,
                params: z.object({ userId: snowflakeSchema }),
                body: updateUserModerationRecordSchema,
                response: { 200: dataEnvelope(userModerationRecordSchema), ...errorResponses }
            }
        },
        async (request) => {
            const updateSet: Partial<typeof discordModerationRecords.$inferInsert> = {
                updatedAt: new Date()
            };
            if (request.body.offenceLevel !== undefined) {
                updateSet.offenceLevel = request.body.offenceLevel;
            }
            if (request.body.stageWarnings !== undefined) {
                updateSet.stageWarnings = request.body.stageWarnings;
            }
            if (request.body.infractions !== undefined) {
                updateSet.infractions = request.body.infractions;
            }
            if (request.body.timeouts !== undefined) {
                updateSet.timeouts = request.body.timeouts;
            }
            if (request.body.apology !== undefined) {
                updateSet.apologyStatus = request.body.apology.status;
                updateSet.apologyText = request.body.apology.text;
                updateSet.apologySubmittedAt = request.body.apology.submittedAt ? new Date(request.body.apology.submittedAt) : null;
                updateSet.apologyReviewedBy = request.body.apology.reviewedBy ?? null;
                updateSet.apologyReviewedAt = request.body.apology.reviewedAt ? new Date(request.body.apology.reviewedAt) : null;
            }

            const [saved] = await database
                .insert(discordModerationRecords)
                .values({
                    userId: request.params.userId,
                    offenceLevel: request.body.offenceLevel ?? 0,
                    stageWarnings: request.body.stageWarnings ?? 0,
                    infractions: request.body.infractions ?? [],
                    timeouts: request.body.timeouts ?? [],
                    apologyStatus: request.body.apology?.status ?? "none",
                    apologyText: request.body.apology?.text ?? null,
                    apologySubmittedAt: request.body.apology?.submittedAt ? new Date(request.body.apology.submittedAt) : null,
                    apologyReviewedBy: request.body.apology?.reviewedBy ?? null,
                    apologyReviewedAt: request.body.apology?.reviewedAt ? new Date(request.body.apology.reviewedAt) : null
                })
                .onConflictDoUpdate({
                    target: discordModerationRecords.userId,
                    set: updateSet
                })
                .returning();

            if (saved === undefined) {
                throw new Error("Discord moderation record insert returned no row.");
            }

            return { data: toRecordResponse(saved) };
        }
    );

    application.delete(
        "/discord/moderation/:userId",
        {
            preHandler: supervisorOrService,
            schema: {
                tags: ["Discord"],
                summary: "Reset or delete moderation record for a user.",
                security,
                params: z.object({ userId: snowflakeSchema }),
                response: { 200: dataEnvelope(z.object({ deleted: z.boolean() })), ...errorResponses }
            }
        },
        async (request) => {
            await database.delete(discordModerationRecords).where(eq(discordModerationRecords.userId, request.params.userId));

            return { data: { deleted: true } };
        }
    );
};
