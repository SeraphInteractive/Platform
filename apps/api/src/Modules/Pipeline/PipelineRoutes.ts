import { NotificationType, pipelineProgressSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { actorOf, requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import { personOfActor } from "../../Infrastructure/Notifications/Notification.js";

const cacheKey = "pipeline:progress";
const ttlOneYear = 365 * 86400;

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
    const { keyValueStore, notifier } = services;
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
            const raw = await keyValueStore.get(cacheKey);
            if (raw === null) {
                return { data: defaultProgress };
            }
            try {
                const parsed = JSON.parse(raw);
                return { data: pipelineProgressSchema.parse(parsed) };
            } catch {
                // fallback to initial baseline on stale cache structure
                return { data: defaultProgress };
            }
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
            const now = new Date().toISOString();
            const record = {
                stepIndex: request.body.stepIndex,
                stepId: request.body.stepId,
                stepTitle: request.body.stepTitle,
                phaseNumber: request.body.phaseNumber,
                phaseTitle: request.body.phaseTitle,
                progressPercent: request.body.progressPercent,
                isPhaseTransition: request.body.isPhaseTransition,
                updatedAt: now
            };

            await keyValueStore.set(cacheKey, JSON.stringify(record), ttlOneYear);

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

            return { data: record };
        }
    );
};
