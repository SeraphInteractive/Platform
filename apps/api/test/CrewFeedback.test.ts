import {
    FeedbackOutcome,
    FeedbackQuestionKind,
    FeedbackSurveyStatus,
    NotificationType,
    type FeedbackSettingsDto,
    type FeedbackSubjectDto,
    type FeedbackSurveyDetailDto,
    type FeedbackSurveyDto
} from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { feedbackResponses } from "../src/Infrastructure/Database/Schema.js";
import { createTestContext, json, nextSnowflake, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("crew feedback API", () => {
    let context: TestContext;
    let admin: TestUser;
    let supervisor: TestUser;
    let subject: FeedbackSubjectDto;
    const serviceHeaders = { authorization: `Bearer ${serviceToken}` };
    const supervisorPerson = { discordId: nextSnowflake(), username: "anim_lead" };
    const day = 24 * 60 * 60 * 1000;

    async function inject(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        url: string,
        headers: Record<string, string>,
        payload?: unknown
    ): Promise<LightMyRequestResponse> {
        return context.application.inject({ method, url: `/api/v1${url}`, headers, payload: payload as never });
    }

    function answers(overall: string, remark?: string): { questionId: string; value: string }[] {
        const base = [
            { questionId: "overall", value: overall },
            { questionId: "direction", value: "4" },
            { questionId: "approachable", value: "5" }
        ];
        return remark === undefined ? base : [...base, { questionId: "remarks", value: remark }];
    }

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        supervisor = await context.createUser(Role.Supervisor);
    });

    afterAll(async () => {
        await context.close();
    });

    it("keeps everything to project leadership", async () => {
        expect((await inject("GET", "/feedback/subjects", supervisor.headers)).statusCode).toBe(403);
        expect((await inject("GET", "/feedback/settings", supervisor.headers)).statusCode).toBe(403);
        const settings = json<{ data: FeedbackSettingsDto }>(await inject("GET", "/feedback/settings", admin.headers)).data;
        expect(settings.questions.map((question) => question.id)).toEqual([
            "overall",
            "direction",
            "approachable",
            "going_well",
            "remarks"
        ]);
        expect(settings.firstAfterDays).toBe(30);
        expect(settings.intervalDays).toBe(90);
    });

    it("schedules the first check-in a month after the supervisor starts", async () => {
        const startedAt = new Date(Date.now() - 40 * day).toISOString();
        const created = await inject("POST", "/feedback/subjects", admin.headers, {
            supervisor: supervisorPerson,
            title: "Animation Supervisor",
            channelId: "600000000000000001",
            crewRoleIds: ["600000000000000002"],
            startedAt
        });
        expect(created.statusCode).toBe(201);
        subject = json<{ data: FeedbackSubjectDto }>(created).data;
        expect(new Date(subject.nextSurveyAt ?? 0).getTime()).toBe(new Date(startedAt).getTime() + 30 * day);
    });

    it("opens due check-ins once and schedules the next one quarterly", async () => {
        const now = new Date();
        expect(await context.services.feedbackService.openDue(now)).toBe(1);
        expect(await context.services.feedbackService.openDue(now)).toBe(0);
        expect(context.notifier.notifications.some((n) => n.type === NotificationType.FeedbackSurveyOpened)).toBe(true);

        const [refreshed] = json<{ data: FeedbackSubjectDto[] }>(await inject("GET", "/feedback/subjects", admin.headers)).data;
        expect(refreshed?.openSurveyId).not.toBeNull();
        expect(new Date(refreshed?.nextSurveyAt ?? 0).getTime()).toBe(now.getTime() + 90 * day);

        const open = json<{ data: FeedbackSurveyDto[] }>(await inject("GET", "/feedback/open-surveys", serviceHeaders)).data;
        expect(open).toHaveLength(1);
        expect(open[0]?.crewRoleIds).toEqual(["600000000000000002"]);
        expect((await inject("POST", `/feedback/subjects/${subject.id}/surveys`, admin.headers)).statusCode).toBe(409);
    });

    it("takes anonymous answers, lets crew update them, and refuses the supervisor", async () => {
        const surveyId =
            json<{ data: FeedbackSubjectDto[] }>(await inject("GET", "/feedback/subjects", admin.headers)).data[0]?.openSurveyId ?? "";
        const crew = { discordId: nextSnowflake(), username: "animator" };

        const first = await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
            respondent: crew,
            answers: answers("2")
        });
        expect(json<{ data: { updated: boolean } }>(first).data.updated).toBe(false);
        const again = await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
            respondent: crew,
            answers: answers("3", "Needs clearer deadlines")
        });
        expect(json<{ data: { updated: boolean } }>(again).data.updated).toBe(true);
        await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
            respondent: { discordId: nextSnowflake(), username: "rigger" },
            answers: answers("5")
        });

        expect(
            (
                await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
                    respondent: supervisorPerson,
                    answers: answers("5")
                })
            ).statusCode
        ).toBe(403);
        expect(
            (await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, { respondent: crew, answers: answers("9") }))
                .statusCode
        ).toBe(400);
        expect(
            (
                await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
                    respondent: crew,
                    answers: [{ questionId: "overall", value: "4" }]
                })
            ).statusCode
        ).toBe(400);
        expect(
            (await inject("PUT", `/feedback/surveys/${surveyId}/responses`, admin.headers, { respondent: crew, answers: answers("4") }))
                .statusCode
        ).toBe(403);

        const stored = await context.database.select().from(feedbackResponses).where(eq(feedbackResponses.surveyId, surveyId));
        expect(stored).toHaveLength(2);
        expect(JSON.stringify(stored)).not.toContain(crew.discordId);

        expect((await inject("GET", `/feedback/surveys/${surveyId}/results`, serviceHeaders)).statusCode).toBe(403);
        expect(
            (await inject("POST", `/feedback/surveys/${surveyId}/outcome`, admin.headers, { outcome: FeedbackOutcome.NoAction })).statusCode
        ).toBe(409);
    });

    it("closes expired check-ins and summarises the results", async () => {
        const surveyId =
            json<{ data: FeedbackSurveyDto[] }>(await inject("GET", `/feedback/subjects/${subject.id}/surveys`, admin.headers)).data[0]
                ?.id ?? "";
        expect(await context.services.feedbackService.closeExpired(new Date(Date.now() + 15 * day))).toBe(1);
        expect(context.notifier.notifications.some((n) => n.type === NotificationType.FeedbackSurveyClosed)).toBe(true);

        const results = json<{ data: FeedbackSurveyDetailDto }>(
            await inject("GET", `/feedback/surveys/${surveyId}/results`, admin.headers)
        ).data;
        expect(results.status).toBe(FeedbackSurveyStatus.Closed);
        expect(results.responseCount).toBe(2);
        const overall = results.ratings.find((rating) => rating.questionId === "overall");
        expect(overall?.average).toBe(4);
        expect(overall?.distribution).toEqual([0, 0, 1, 0, 1]);
        expect(results.comments.find((comment) => comment.questionId === "remarks")?.answers).toEqual(["Needs clearer deadlines"]);

        const late = await inject("PUT", `/feedback/surveys/${surveyId}/responses`, serviceHeaders, {
            respondent: { discordId: nextSnowflake(), username: "late" },
            answers: answers("1")
        });
        expect(late.statusCode).toBe(409);
    });

    it("records a mitigation and sends the action steps, once", async () => {
        const surveyId =
            json<{ data: FeedbackSurveyDto[] }>(await inject("GET", `/feedback/subjects/${subject.id}/surveys`, admin.headers)).data[0]
                ?.id ?? "";
        expect(
            (await inject("POST", `/feedback/surveys/${surveyId}/outcome`, admin.headers, { outcome: FeedbackOutcome.Mitigation }))
                .statusCode
        ).toBe(400);

        const before = context.notifier.notifications.length;
        const recorded = await inject("POST", `/feedback/surveys/${surveyId}/outcome`, admin.headers, {
            outcome: FeedbackOutcome.Mitigation,
            message: "1. Post weekly deadlines in the department channel.",
            internalNote: "Two crew asked for clearer deadlines."
        });
        expect(recorded.statusCode).toBe(200);
        const survey = json<{ data: FeedbackSurveyDto }>(recorded).data;
        expect(survey.outcome).toBe(FeedbackOutcome.Mitigation);
        expect(survey).not.toHaveProperty("internalNote");
        expect(context.notifier.notifications.slice(before).map((n) => n.type)).toEqual([NotificationType.FeedbackOutcomeRecorded]);

        const forBot = json<{ data: FeedbackSurveyDto }>(await inject("GET", `/feedback/surveys/${surveyId}`, serviceHeaders)).data;
        expect(forBot).not.toHaveProperty("ratings");
        expect(forBot.outcomeMessage).toContain("weekly deadlines");

        expect(
            (await inject("POST", `/feedback/surveys/${surveyId}/outcome`, admin.headers, { outcome: FeedbackOutcome.NoAction })).statusCode
        ).toBe(409);
    });

    it("sends nothing when there is no action to take", async () => {
        const survey = json<{ data: FeedbackSurveyDto }>(
            await inject("POST", `/feedback/subjects/${subject.id}/surveys`, admin.headers)
        ).data;
        await inject("POST", `/feedback/surveys/${survey.id}/close`, admin.headers);
        const before = context.notifier.notifications.length;
        await inject("POST", `/feedback/surveys/${survey.id}/outcome`, admin.headers, {
            outcome: FeedbackOutcome.NoAction,
            message: "ignored"
        });
        expect(context.notifier.notifications.length).toBe(before);
        const saved = json<{ data: FeedbackSurveyDto }>(await inject("GET", `/feedback/surveys/${survey.id}`, admin.headers)).data;
        expect(saved.outcomeMessage).toBeNull();
        expect(saved.sequence).toBe(2);
    });

    it("updates questions and ends reviews, closing any open check-in", async () => {
        const questions = [
            { id: "overall", label: "How is it going?", kind: FeedbackQuestionKind.Rating, required: true },
            { id: "remarks", label: "Anything else?", kind: FeedbackQuestionKind.Text, required: false }
        ];
        expect((await inject("PUT", "/feedback/settings", admin.headers, { questions, openDays: 7 })).statusCode).toBe(200);
        const survey = json<{ data: FeedbackSurveyDto }>(
            await inject("POST", `/feedback/subjects/${subject.id}/surveys`, admin.headers)
        ).data;
        expect(survey.questions).toEqual(questions);

        const ended = json<{ data: FeedbackSubjectDto }>(
            await inject("PATCH", `/feedback/subjects/${subject.id}`, admin.headers, { isActive: false })
        ).data;
        expect(ended.isActive).toBe(false);
        expect(ended.endedAt).not.toBeNull();
        expect(ended.nextSurveyAt).toBeNull();
        expect(ended.openSurveyId).toBeNull();
        expect((await inject("POST", `/feedback/subjects/${subject.id}/surveys`, admin.headers)).statusCode).toBe(409);
    });
});
