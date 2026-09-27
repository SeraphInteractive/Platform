import { NotificationType, pipelineProgressSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { actorOf, optionalUser, requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { pipelineProgress, type PipelineProgressRecord } from "../../Infrastructure/Database/Schema.js";
import { personOfActor } from "../../Infrastructure/Notifications/Notification.js";

const defaultProgress = {
    stepIndex: 0,
    stepId: "0.1",
    stepTitle: "Story Pitching",
    phaseNumber: 0,
    phaseTitle: "Phase 0: Pre-Production",
    progressPercent: 3,
    isPhaseTransition: false,
    updatedAt: null
};

function toPipelineProgressResponse(record: PipelineProgressRecord): z.infer<typeof pipelineProgressSchema> {
    return {
        stepIndex: record.stepIndex,
        stepId: record.stepId,
        stepTitle: record.stepTitle,
        phaseNumber: record.phaseNumber,
        phaseTitle: record.phaseTitle,
        progressPercent: record.progressPercent,
        isPhaseTransition: record.isPhaseTransition,
        updatedAt: record.updatedAt.toISOString()
    };
}

export const updatePipelineProgressSchema = z.object({
    stepIndex: z.number().int().min(0),
    stepId: z.string().max(32),
    stepTitle: z.string().max(128),
    phaseNumber: z.number().int().min(0),
    phaseTitle: z.string().max(128),
    progressPercent: z.number().min(0).max(100),
    isPhaseTransition: z.boolean()
});

export const pipelineRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { database, notifier } = services;
    const security = [{ bearer: [] }];
    const supervisor = requireRoleOrService(Role.Supervisor);

    application.get(
        "/pipeline",
        {
            schema: {
                tags: ["Pipeline"],
                summary: "Current production roadmap progress.",
                response: { 200: dataEnvelope(pipelineProgressSchema), ...errorResponses }
            }
        },
        async () => {
            const [record] = await database.select().from(pipelineProgress).limit(1);
            return { data: record === undefined ? defaultProgress : toPipelineProgressResponse(record) };
        }
    );

    application.post(
        "/pipeline/progress",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Pipeline"],
                summary: "Advance the production pipeline stage and broadcast Discord announcement.",
                security,
                body: updatePipelineProgressSchema,
                response: { 200: dataEnvelope(pipelineProgressSchema), ...errorResponses }
            }
        },
        async (request) => {
            const values = { ...request.body, updatedBy: optionalUser(request)?.id ?? null };
            const [record] = await database
                .insert(pipelineProgress)
                .values({ id: 1, ...values })
                .onConflictDoUpdate({ target: pipelineProgress.id, set: { ...values, updatedAt: new Date() } })
                .returning();
            if (record === undefined) {
                throw new Error("Pipeline progress upsert returned no row.");
            }

            notifier.notify({
                type: NotificationType.PipelineUpdated,
                stepId: record.stepId,
                stepTitle: record.stepTitle,
                phaseNumber: record.phaseNumber,
                phaseTitle: record.phaseTitle,
                progressPercent: record.progressPercent,
                isPhaseTransition: record.isPhaseTransition,
                actor: personOfActor(actorOf(request))
            });

            return { data: toPipelineProgressResponse(record) };
        }
    );
};
