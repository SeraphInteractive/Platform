import { defaultFeedbackQuestions, FeedbackOutcome, FeedbackSurveyStatus, type FeedbackSurveyDto } from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { checkInMessage, outcomeMessage } from "../src/Views/FeedbackViews.js";

const createdAt = "2026-10-19T12:00:00.000Z";
const crewRole = "1100000000000000003";

function survey(overrides: Partial<FeedbackSurveyDto> = {}): FeedbackSurveyDto {
    return {
        id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        subjectId: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b5c",
        sequence: 1,
        title: "Animation Supervisor",
        supervisor: { discordId: "364539598942240768", username: "lead" },
        crewRoleIds: [crewRole],
        status: FeedbackSurveyStatus.Open,
        opensAt: createdAt,
        closesAt: "2026-11-02T12:00:00.000Z",
        closedAt: null,
        questions: [...defaultFeedbackQuestions],
        intro: "",
        channelId: "1100000000000000001",
        messageId: null,
        responseCount: 0,
        outcome: null,
        outcomeMessage: null,
        outcomeBy: null,
        outcomeAt: null,
        createdAt,
        ...overrides
    };
}

function serialized(value: unknown): string {
    return JSON.stringify(value, (_key, inner: unknown) =>
        inner !== null && typeof inner === "object" && "toJSON" in inner ? (inner as { toJSON(): unknown }).toJSON() : inner
    );
}

describe("crew check-in views", () => {
    it("pings the crew only when a check-in opens and promises anonymity", () => {
        const open = checkInMessage(survey(), true);
        expect(open.allowedMentions.roles).toEqual([crewRole]);
        expect(serialized(open)).toContain("optional and anonymous");
        expect(serialized(open)).toContain("fbk:");

        const closed = checkInMessage(survey({ status: FeedbackSurveyStatus.Closed, responseCount: 4 }), true);
        expect(closed.allowedMentions.roles).toEqual([]);
        expect(serialized(closed)).toContain("4 responses");
        expect(serialized(closed)).toContain('"disabled":true');
    });

    it("only messages the supervisor when there is something to send", () => {
        expect(outcomeMessage(survey({ outcome: FeedbackOutcome.NoAction }))).toBeNull();
        const steps = serialized(outcomeMessage(survey({ outcome: FeedbackOutcome.Mitigation, outcomeMessage: "Post weekly deadlines." })));
        expect(steps).toContain("Next steps from project leadership");
        expect(steps).toContain("Post weekly deadlines.");
        expect(serialized(outcomeMessage(survey({ outcome: FeedbackOutcome.Acknowledged, outcomeMessage: "Good job!" })))).toContain(
            "A note from project leadership"
        );
    });
});
