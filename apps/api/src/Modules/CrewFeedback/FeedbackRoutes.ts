import {
    bindFeedbackSurveySchema,
    createFeedbackSubjectSchema,
    feedbackResponseInputSchema,
    feedbackSettingsSchema,
    feedbackSubjectSchema,
    feedbackSurveyDetailSchema,
    feedbackSurveySchema,
    recordFeedbackOutcomeSchema,
    updateFeedbackSettingsSchema,
    updateFeedbackSubjectSchema,
    type FeedbackSettingsDto,
    type FeedbackSubjectDto,
    type FeedbackSurveyDetailDto,
    type FeedbackSurveyDto
} from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { requireRole, requireRoleOrService, requireService, userPrincipalOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { Role } from "../../Domain/Roles.js";
import type { SubjectView, SurveyResults, SurveyView } from "./FeedbackService.js";

const idParams = z.object({ id: uuidSchema });

function presentSubject({ record, surveyCount, openSurveyId }: SubjectView): FeedbackSubjectDto {
    return {
        id: record.id,
        supervisor: { discordId: record.supervisorDiscordId, username: record.supervisorUsername },
        title: record.title,
        channelId: record.channelId,
        crewRoleIds: record.crewRoleIds,
        startedAt: toIso(record.startedAt),
        firstAfterDays: record.firstAfterDays,
        intervalDays: record.intervalDays,
        isActive: record.isActive,
        endedAt: toIso(record.endedAt),
        nextSurveyAt: toIso(record.nextSurveyAt),
        sourceTicketId: record.sourceTicketId,
        surveyCount,
        openSurveyId,
        createdAt: toIso(record.createdAt),
        updatedAt: toIso(record.updatedAt)
    };
}

function presentSurvey({ record, subject, responseCount }: SurveyView): FeedbackSurveyDto {
    return {
        id: record.id,
        subjectId: record.subjectId,
        sequence: record.sequence,
        title: subject.title,
        supervisor: { discordId: subject.supervisorDiscordId, username: subject.supervisorUsername },
        crewRoleIds: subject.crewRoleIds,
        status: record.status,
        opensAt: toIso(record.opensAt),
        closesAt: toIso(record.closesAt),
        closedAt: toIso(record.closedAt),
        questions: record.questions,
        intro: record.intro,
        channelId: record.channelId,
        messageId: record.messageId,
        responseCount,
        outcome: record.outcome,
        outcomeMessage: record.outcomeMessage,
        outcomeBy:
            record.outcomeByDiscordId === null
                ? null
                : { discordId: record.outcomeByDiscordId, username: record.outcomeByUsername ?? "Unknown" },
        outcomeAt: toIso(record.outcomeAt),
        createdAt: toIso(record.createdAt)
    };
}

function presentResults(results: SurveyResults): FeedbackSurveyDetailDto {
    return { ...presentSurvey(results), internalNote: results.record.internalNote, ratings: results.ratings, comments: results.comments };
}

export const feedbackRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { feedbackService } = services;
    const security = [{ bearer: [] }];
    const leadership = requireRole(Role.Admin);
    const leadershipOrService = requireRoleOrService(Role.Admin);
    const service = requireService();
    const tags = ["Crew feedback"];

    async function presentSettings(): Promise<FeedbackSettingsDto> {
        const settings = await feedbackService.effectiveSettings();
        return {
            questions: settings.questions,
            firstAfterDays: settings.firstAfterDays,
            intervalDays: settings.intervalDays,
            openDays: settings.openDays,
            intro: settings.intro,
            pingCrew: settings.pingCrew,
            updatedAt: toIso(settings.updatedAt)
        };
    }

    application.get(
        "/feedback/settings",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Get the crew check-in settings.",
                security,
                response: { 200: dataEnvelope(feedbackSettingsSchema), ...errorResponses }
            }
        },
        async () => ({ data: await presentSettings() })
    );

    application.put(
        "/feedback/settings",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Update the crew check-in questions and schedule.",
                security,
                body: updateFeedbackSettingsSchema,
                response: { 200: dataEnvelope(feedbackSettingsSchema), ...errorResponses }
            }
        },
        async (request) => {
            await feedbackService.updateSettings(request.body);
            return { data: await presentSettings() };
        }
    );

    application.get(
        "/feedback/subjects",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "List supervisors whose crews are checked in with.",
                security,
                response: { 200: dataEnvelope(z.array(feedbackSubjectSchema)), ...errorResponses }
            }
        },
        async () => ({ data: (await feedbackService.subjects()).map(presentSubject) })
    );

    application.post(
        "/feedback/subjects",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Start crew check-ins for a supervisor.",
                security,
                body: createFeedbackSubjectSchema,
                response: { 201: dataEnvelope(feedbackSubjectSchema), ...errorResponses }
            }
        },
        async (request, reply) => reply.status(201).send({ data: presentSubject(await feedbackService.createSubject(request.body)) })
    );

    application.patch(
        "/feedback/subjects/:id",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Update a supervisor's check-in schedule or end their reviews.",
                security,
                params: idParams,
                body: updateFeedbackSubjectSchema,
                response: { 200: dataEnvelope(feedbackSubjectSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentSubject(await feedbackService.updateSubject(request.params.id, request.body)) })
    );

    application.delete(
        "/feedback/subjects/:id",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Delete a supervisor and every check-in result for them.",
                security,
                params: idParams,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await feedbackService.deleteSubject(request.params.id);
            return reply.status(204).send(null);
        }
    );

    application.get(
        "/feedback/subjects/:id/surveys",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "List a supervisor's check-ins, newest first.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(z.array(feedbackSurveySchema)), ...errorResponses }
            }
        },
        async (request) => ({ data: (await feedbackService.surveys(request.params.id)).map(presentSurvey) })
    );

    application.post(
        "/feedback/subjects/:id/surveys",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Send a check-in now instead of waiting for the schedule.",
                security,
                params: idParams,
                response: { 201: dataEnvelope(feedbackSurveySchema), ...errorResponses }
            }
        },
        async (request, reply) => reply.status(201).send({ data: presentSurvey(await feedbackService.openNow(request.params.id)) })
    );

    application.get(
        "/feedback/open-surveys",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "List check-ins that are taking answers.",
                security,
                response: { 200: dataEnvelope(z.array(feedbackSurveySchema)), ...errorResponses }
            }
        },
        async () => ({ data: (await feedbackService.openSurveys()).map(presentSurvey) })
    );

    application.get(
        "/feedback/surveys/:id",
        {
            preHandler: leadershipOrService,
            schema: {
                tags,
                summary: "Get a check-in.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(feedbackSurveySchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentSurvey(await feedbackService.survey(request.params.id)) })
    );

    application.get(
        "/feedback/surveys/:id/results",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Get anonymous check-in results. Never shared with the supervisor.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(feedbackSurveyDetailSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentResults(await feedbackService.results(request.params.id)) })
    );

    application.post(
        "/feedback/surveys/:id/close",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Stop taking answers early.",
                security,
                params: idParams,
                response: { 200: dataEnvelope(feedbackSurveySchema), ...errorResponses }
            }
        },
        async (request) => ({ data: presentSurvey(await feedbackService.closeNow(request.params.id)) })
    );

    application.post(
        "/feedback/surveys/:id/outcome",
        {
            preHandler: leadership,
            schema: {
                tags,
                summary: "Record what leadership decided after reading the results.",
                security,
                params: idParams,
                body: recordFeedbackOutcomeSchema,
                response: { 200: dataEnvelope(feedbackSurveySchema), ...errorResponses }
            }
        },
        async (request) => {
            const { user } = userPrincipalOf(request);
            const actor = { discordId: user.discordId, username: user.discordUsername.slice(0, 64) };
            return { data: presentSurvey(await feedbackService.recordOutcome(request.params.id, request.body, actor)) };
        }
    );

    application.put(
        "/feedback/surveys/:id/responses",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Record or replace a crew member's anonymous answers.",
                security,
                params: idParams,
                body: feedbackResponseInputSchema,
                response: { 200: dataEnvelope(z.object({ updated: z.boolean() })), ...errorResponses }
            }
        },
        async (request) => ({ data: await feedbackService.respond(request.params.id, request.body) })
    );

    application.put(
        "/feedback/surveys/:id/message",
        {
            preHandler: service,
            schema: {
                tags,
                summary: "Record the Discord message that announces a check-in.",
                security,
                params: idParams,
                body: bindFeedbackSurveySchema,
                response: { 204: z.null(), ...errorResponses }
            }
        },
        async (request, reply) => {
            await feedbackService.bindMessage(request.params.id, request.body.messageId);
            return reply.status(204).send(null);
        }
    );
};
