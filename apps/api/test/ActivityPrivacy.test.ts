import { NotificationType, TicketEventKind, type ActivityEntryDto } from "@platform/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("activity feed privacy", () => {
    let context: TestContext;
    let supervisor: TestUser;
    const ticketId = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
    const person = { discordId: "215537065863938049", username: "reviewer" };

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);
    });

    afterAll(async () => {
        await context.close();
    });

    it("keeps ticket and crew feedback events out of the shared activity log", async () => {
        context.notifier.notify({
            type: NotificationType.TicketActivity,
            ticketId,
            eventId: ticketId,
            kind: TicketEventKind.StageChanged,
            actor: person,
            stage: null,
            target: null,
            note: "Private decision note",
            reply: null
        });
        context.notifier.notify({ type: NotificationType.FeedbackOutcomeRecorded, surveyId: ticketId });
        context.notifier.notify({ type: NotificationType.AnnouncementPublished, title: "Hello", target: "general", author: person });
        await new Promise((resolve) => setTimeout(resolve, 50));

        const response = await context.application.inject({
            method: "GET",
            url: "/api/v1/telemetry/activity",
            headers: supervisor.headers
        });
        expect(response.statusCode).toBe(200);
        const types = json<{ data: ActivityEntryDto[] }>(response).data.map((entry) => entry.notification.type);
        expect(types).toContain(NotificationType.AnnouncementPublished);
        expect(types).not.toContain(NotificationType.TicketActivity);
        expect(types).not.toContain(NotificationType.FeedbackOutcomeRecorded);
        expect(response.body).not.toContain("Private decision note");
    });
});
