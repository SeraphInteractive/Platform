import { autoModRuleSchema, createAutoModRuleSchema, uuidSchema, type AutoModRuleDto } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, toIso } from "../../Common/Http/Schemas.js";
import { currentUser, requireRole, requireRoleOrService } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import type { AutomodRuleRecord } from "../../Infrastructure/Database/Schema.js";

const idParams = z.object({ id: uuidSchema });

function presentRule(record: AutomodRuleRecord): AutoModRuleDto {
    return {
        id: record.id,
        pattern: record.pattern,
        isRegex: record.isRegex,
        createdAt: toIso(record.createdAt)
    };
}

export const autoModRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { autoModService } = services;
    const adminOrService = requireRoleOrService(Role.Admin);
    const admin = requireRole(Role.Admin);
    const security = [{ bearer: [] }];

    application.get(
        "",
        {
            schema: {
                tags: ["AutoMod"],
                summary: "List custom AutoMod rules.",
                security,
                response: { 200: dataEnvelope(z.array(autoModRuleSchema)), ...errorResponses }
            },
            preHandler: adminOrService
        },
        async (_request, reply) => {
            const rules = await autoModService.list();
            return reply.send({ data: rules.map(presentRule) });
        }
    );

    application.post(
        "",
        {
            schema: {
                tags: ["AutoMod"],
                summary: "Create a custom AutoMod rule.",
                security,
                body: createAutoModRuleSchema,
                response: { 201: dataEnvelope(autoModRuleSchema), ...errorResponses }
            },
            preHandler: admin
        },
        async (request, reply) => {
            const user = currentUser(request);
            const created = await autoModService.create(request.body.pattern, request.body.isRegex, user.id);
            return reply.status(201).send({ data: presentRule(created) });
        }
    );

    application.delete(
        "/:id",
        {
            schema: {
                tags: ["AutoMod"],
                summary: "Delete a custom AutoMod rule.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            },
            preHandler: admin
        },
        async (request, reply) => {
            await autoModService.delete(request.params.id);
            return reply.status(204).send(null);
        }
    );
};
