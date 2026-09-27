import { fieldRules } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
    dataEnvelope,
    errorResponses,
    pageEnvelope,
    paginationQuerySchema,
    timestampSchema,
    toIso,
    uuidSchema
} from "../../Common/Http/Schemas.js";
import { actorOf, optionalUser, requireRole, userActorOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { PollType, RoundStatus } from "../../Domain/Enums.js";
import { Role } from "../../Domain/Roles.js";
import type { RoundResultRecord } from "../../Infrastructure/Database/Schema.js";
import { leaderboardSchema, roundResultSchema, type RoundResultResponse } from "../Leaderboards/LeaderboardTypes.js";
import { roundDetailSchema, roundSchema, toRoundResponse } from "./RoundPresenter.js";

const roundParams = z.object({ roundId: uuidSchema });
const dateInput = timestampSchema.transform((value) => new Date(value));
const editableStatus = z.enum([RoundStatus.Draft, RoundStatus.Open, RoundStatus.Closed]);

function toRoundResultResponse(result: RoundResultRecord): RoundResultResponse {
    return {
        id: result.id,
        roundId: result.roundId,
        totalBallots: result.totalBallots,
        totalPoints: result.totalPoints,
        isConserved: result.isConserved,
        leaderboard: result.leaderboard,
        separations: result.separationResults,
        finalizedAt: toIso(result.finalizedAt),
        finalizedBy: result.finalizedBy
    };
}

export const roundsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { roundsService, leaderboardService } = services;
    const security = [{ bearer: [] }];
    const supervisor = requireRole(Role.Supervisor);

    application.get(
        "/rounds",
        {
            schema: {
                tags: ["Rounds"],
                summary: "List voting rounds.",
                querystring: paginationQuerySchema.extend({ status: z.enum(RoundStatus).optional() }),
                response: { 200: pageEnvelope(roundSchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await roundsService.list(request.query, optionalUser(request));
            return { data: page.data.map(toRoundResponse), meta: page.meta };
        }
    );

    application.get(
        "/rounds/:roundId",
        {
            schema: {
                tags: ["Rounds"],
                summary: "Get a voting round.",
                params: roundParams,
                response: { 200: dataEnvelope(roundDetailSchema), ...errorResponses }
            }
        },
        async (request) => {
            const detail = await roundsService.getDetail(request.params.roundId, optionalUser(request));
            return {
                data: {
                    ...toRoundResponse(detail.round),
                    eligibleEntryCount: detail.eligibleEntryCount,
                    ballotCount: detail.ballotCount,
                    warnings: [...detail.warnings]
                }
            };
        }
    );

    application.post(
        "/rounds",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Rounds"],
                summary: "Create a voting round in draft status.",
                security,
                body: z.object({
                    title: fieldRules.roundTitle,
                    pollType: z.enum(PollType).default(PollType.RankedChoice),
                    opensAt: dateInput.nullable().default(null),
                    closesAt: dateInput.nullable().default(null)
                }),
                response: { 201: dataEnvelope(roundSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const round = await roundsService.create(userActorOf(request), request.body);
            return reply.status(201).send({ data: toRoundResponse(round) });
        }
    );

    application.patch(
        "/rounds/:roundId",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Rounds"],
                summary: "Update a round. Status changes follow draft → open ⇄ closed.",
                security,
                params: roundParams,
                body: z
                    .object({
                        title: fieldRules.roundTitle.optional(),
                        pollType: z.enum(PollType).optional(),
                        status: editableStatus.optional(),
                        opensAt: dateInput.nullable().optional(),
                        closesAt: dateInput.nullable().optional()
                    })
                    .refine((body) => Object.keys(body).length > 0, "at least one field is required"),
                response: { 200: dataEnvelope(roundSchema), ...errorResponses }
            }
        },
        async (request) => {
            const round = await roundsService.update(actorOf(request), request.params.roundId, request.body);
            return { data: toRoundResponse(round) };
        }
    );

    application.delete(
        "/rounds/:roundId",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Rounds"],
                summary: "Delete a round that has not been finalized.",
                security,
                params: roundParams,
                response: { 204: z.null().describe("Deleted"), ...errorResponses }
            }
        },
        async (request, reply) => {
            await roundsService.delete(request.params.roundId);
            return reply.status(204).send(null);
        }
    );

    application.post(
        "/rounds/:roundId/finalize",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Rounds"],
                summary: "Certify the results of a closed round.",
                security,
                params: roundParams,
                response: { 200: dataEnvelope(roundResultSchema), ...errorResponses }
            }
        },
        async (request) => {
            const result = await leaderboardService.finalize(userActorOf(request), request.params.roundId);
            return { data: toRoundResultResponse(result) };
        }
    );

    application.get(
        "/rounds/:roundId/leaderboard",
        {
            schema: {
                tags: ["Leaderboards"],
                summary: "Live standings for a round.",
                params: roundParams,
                response: { 200: dataEnvelope(leaderboardSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            void reply.header("Cache-Control", "public, max-age=10, stale-while-revalidate=5");
            return { data: await leaderboardService.getLive(request.params.roundId, optionalUser(request)) };
        }
    );

    application.get(
        "/rounds/:roundId/results",
        {
            schema: {
                tags: ["Leaderboards"],
                summary: "Certified results of a finalized round.",
                params: roundParams,
                response: { 200: dataEnvelope(roundResultSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const result = await leaderboardService.getResult(request.params.roundId);
            void reply.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
            return { data: toRoundResultResponse(result) };
        }
    );
};
