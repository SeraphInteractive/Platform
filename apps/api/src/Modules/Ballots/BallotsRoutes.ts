import { ballotSchema, ledgerBallotSchema as ledgerRowSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, pageEnvelope, paginationQuerySchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { currentUser, requireParticipant, requireRole, requireUser } from "../../Common/Security/Authorization.js";
import { Role } from "../../Domain/Roles.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import type { BallotRecord } from "../../Infrastructure/Database/Schema.js";
import { picksOf } from "./BallotsService.js";

const roundParams = z.object({ roundId: uuidSchema });

function toBallotResponse(ballot: BallotRecord): z.infer<typeof ballotSchema> {
    return { roundId: ballot.roundId, picks: picksOf(ballot), castAt: toIso(ballot.createdAt), updatedAt: toIso(ballot.updatedAt) };
}

export const ballotsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { ballotsService } = services;
    const security = [{ bearer: [] }];

    application.get(
        "/rounds/:roundId/ballots",
        {
            preHandler: requireRole(Role.Supervisor),
            schema: {
                tags: ["Ballots"],
                summary: "Supervisor ballot ledger for audit and verification.",
                security,
                params: roundParams,
                querystring: paginationQuerySchema,
                response: { 200: pageEnvelope(ledgerRowSchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await ballotsService.ledger(request.params.roundId, request.query, currentUser(request));
            return {
                data: page.data.map((row) => ({
                    discordId: row.discordId,
                    discordUsername: row.discordUsername,
                    picks: [...row.picks],
                    castAt: toIso(row.castAt),
                    updatedAt: toIso(row.updatedAt)
                })),
                meta: page.meta
            };
        }
    );

    application.get(
        "/rounds/:roundId/ballots/me",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Ballots"],
                summary: "Get your ballot for a round.",
                security,
                params: roundParams,
                response: { 200: dataEnvelope(ballotSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: toBallotResponse(await ballotsService.getOwn(currentUser(request).id, request.params.roundId)) })
    );

    application.put(
        "/rounds/:roundId/ballots/me",
        {
            preHandler: requireParticipant(Role.Voter, services.documentsService),
            config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
            schema: {
                tags: ["Ballots"],
                summary: "Cast or replace your ballot. Ranked-choice rounds take 3 ordered picks, binary rounds take 1.",
                security,
                params: roundParams,
                body: z.object({ picks: z.array(uuidSchema).min(1).max(3) }),
                response: { 200: dataEnvelope(ballotSchema), ...errorResponses }
            }
        },
        async (request) => ({
            data: toBallotResponse(await ballotsService.cast(currentUser(request), request.params.roundId, request.body.picks))
        })
    );
};
