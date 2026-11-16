import {
    ApplicationStage,
    PositionStatus,
    TicketAvailability,
    TicketHubStyle,
    TicketKind,
    ticketAvailability,
    TicketStatus,
    type TicketCategoryDto,
    type TicketDto,
    type TicketHubDto,
    type TicketTypeDto
} from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { threadNameOf } from "../src/Services/TicketDesk.js";
import {
    componentEmoji,
    fillTemplate,
    hubMessage,
    staffCard,
    ticketControls,
    transcriptText,
    typePicker
} from "../src/Views/TicketViews.js";

const createdAt = "2026-10-19T12:00:00.000Z";
const staffRole = "1100000000000000003";
const supervisor = { discordId: "364539598942240768", username: "sup" };

function category(overrides: Partial<TicketCategoryDto> = {}): TicketCategoryDto {
    return {
        id: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b5c",
        name: "Production",
        description: "Apply to a department",
        emoji: "🎬",
        position: 0,
        isEnabled: true,
        threadChannelId: "1100000000000000001",
        notificationChannelId: "1100000000000000002",
        logChannelId: null,
        departmentId: null,
        staffRoleIds: [staffRole],
        mentionStaff: true,
        types: [],
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

function type(overrides: Partial<TicketTypeDto> = {}): TicketTypeDto {
    return {
        id: "5d2d7d9a-2c1f-4d4e-9d7e-0a7b3c1f9e11",
        categoryId: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b5c",
        name: "Animation crew",
        description: null,
        emoji: null,
        kind: TicketKind.Application,
        position: 0,
        isEnabled: true,
        staffRoleIds: [],
        threadChannelId: null,
        mentionStaff: true,
        questions: [],
        positionStatus: PositionStatus.Open,
        openings: null,
        filledCount: 0,
        opensAt: null,
        closesAt: null,
        listing: null,
        messages: { interview: null, accepted: null, rejected: null },
        availability: TicketAvailability.Available,
        openTicketCount: 0,
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

function hub(overrides: Partial<TicketHubDto> = {}): TicketHubDto {
    return {
        id: "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        name: "Main",
        channelId: "1100000000000000005",
        messageId: null,
        title: "Tickets",
        description: "",
        color: null,
        style: TicketHubStyle.Buttons,
        categoryIds: [],
        isEnabled: true,
        departmentId: null,
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

function ticket(overrides: Partial<TicketDto> = {}): TicketDto {
    return {
        id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        number: 12,
        typeId: null,
        categoryId: null,
        typeName: "Animation Supervisor",
        categoryName: "Production",
        kind: TicketKind.Application,
        status: TicketStatus.Open,
        stage: ApplicationStage.Submitted,
        opener: { discordId: "215537065863938049", username: "applicant" },
        assignee: null,
        threadId: "1100000000000000004",
        introMessageId: null,
        notificationChannelId: null,
        notificationMessageId: null,
        answers: [{ questionId: "experience", label: "Experience", value: "Five years" }],
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        closedBy: null,
        closedAt: null,
        closeReason: null,
        lastActivityAt: createdAt,
        createdAt,
        updatedAt: createdAt,
        ...overrides
    };
}

function serialized(value: unknown): string {
    return JSON.stringify(value, (_key, inner: unknown) =>
        inner !== null && typeof inner === "object" && "toJSON" in inner ? (inner as { toJSON(): unknown }).toJSON() : inner
    );
}

function categories(count: number): TicketCategoryDto[] {
    return Array.from({ length: count }, (_, index) =>
        category({ id: `0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b${String(index).padStart(2, "0")}`, name: `Category ${index}` })
    );
}

describe("ticket views", () => {
    it("keeps only real emoji so Discord does not reject the message", () => {
        expect(componentEmoji("🎬")).toEqual({ name: "🎬" });
        expect(componentEmoji("<:stairway:110000000000000000>")).toEqual({ id: "110000000000000000", name: "stairway", animated: false });
        expect(componentEmoji("smile")).toBeUndefined();
        expect(componentEmoji(":smile:")).toBeUndefined();
        expect(componentEmoji(null)).toBeUndefined();
    });

    it("puts one button per enabled category on a button hub", () => {
        const all = [...categories(7), category({ id: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4bff", name: "Hidden", isEnabled: false })];
        const json = serialized(hubMessage(hub(), all));
        expect(json.match(/tkcat:/gu)).toHaveLength(7);
        expect(json).not.toContain("Hidden");
    });

    it("shows only the chosen categories, in order, as a menu", () => {
        const all = categories(3);
        const chosen = hub({ style: TicketHubStyle.Menu, categoryIds: [all[2]!.id, all[0]!.id], color: 0x123456 });
        const json = serialized(hubMessage(chosen, all));
        expect(json).toContain("tkhub:");
        expect(json).not.toContain("tkcat:");
        expect(json.indexOf("Category 2")).toBeLessThan(json.indexOf("Category 0"));
        expect(json).not.toContain("Category 1");
        expect(json).toContain(`"accent_color":1193046`);
    });

    it("only offers types that are taking tickets", () => {
        const picker = serialized(
            typePicker(
                category({
                    types: [
                        type({ name: "Open role" }),
                        type({ id: "5d2d7d9a-2c1f-4d4e-9d7e-0a7b3c1f9e12", name: "Filled role", availability: TicketAvailability.Filled }),
                        type({ id: "5d2d7d9a-2c1f-4d4e-9d7e-0a7b3c1f9e13", name: "Off", availability: TicketAvailability.Disabled })
                    ]
                })
            )
        );
        expect(picker).toContain("~~**Filled role**~~");
        expect(picker).not.toContain("Off");
        expect(picker.match(/"value":"5d2d7d9a/gu)).toHaveLength(1);
    });

    it("shows controls that match the stage and assignment", () => {
        const labels = (value: TicketDto): string[] =>
            (ticketControls(value)?.components ?? []).map((component) => (component.toJSON() as { label?: string }).label ?? "");
        expect(labels(ticket())).toEqual(["Invite to interview", "Accept", "Reject", "Claim", "Close ticket"]);
        expect(labels(ticket({ stage: ApplicationStage.Interview, assignee: supervisor }))).toEqual(["Accept", "Reject", "Close ticket"]);
        expect(labels(ticket({ stage: ApplicationStage.Accepted, assignee: supervisor }))).toEqual(["Close ticket"]);
        expect(labels(ticket({ kind: TicketKind.Support, stage: null }))).toEqual(["Claim", "Close ticket"]);
        expect(ticketControls(ticket({ status: TicketStatus.Closed }))).toBeNull();
    });

    it("pings staff only while a ticket is open", () => {
        expect(staffCard(ticket(), [staffRole]).allowedMentions.roles).toEqual([staffRole]);
        expect(staffCard(ticket({ status: TicketStatus.Closed }), [staffRole]).allowedMentions.roles).toEqual([]);
        expect(serialized(staffCard(ticket({ assignee: supervisor }), []))).not.toContain(`tkact:claim`);
    });

    it("fills message templates without letting them mention anyone", () => {
        expect(fillTemplate("Welcome {user}, you are now {position} ({ticket})", { position: "Lead", user: "@everyone", ticket: 3 })).toBe(
            "Welcome @​everyone, you are now Lead (#3)"
        );
    });

    it("writes a readable transcript", () => {
        const text = transcriptText(ticket({ status: TicketStatus.Closed, closedBy: supervisor, closeReason: "Done" }), [
            { at: new Date(createdAt), author: "applicant", content: "Hello", attachments: ["https://cdn.example/a.png"] }
        ]);
        expect(text).toContain("Ticket #12 | Animation Supervisor (Production)");
        expect(text).toContain("Closed by sup: Done");
        expect(text).toContain("[2026-10-19 12:00:00] applicant: Hello");
        expect(text).toContain("attachment: https://cdn.example/a.png");
    });

    it("names threads within Discord's limit", () => {
        expect(threadNameOf(ticket({ typeName: "x".repeat(120) })).length).toBeLessThanOrEqual(100);
    });

    it("treats filled seats and application windows as unavailable", () => {
        const now = new Date(createdAt);
        const base = {
            kind: TicketKind.Application,
            isEnabled: true,
            positionStatus: PositionStatus.Open,
            openings: 2,
            filledCount: 1,
            opensAt: null,
            closesAt: null
        };
        expect(ticketAvailability(base, now)).toBe(TicketAvailability.Available);
        expect(ticketAvailability({ ...base, filledCount: 2 }, now)).toBe(TicketAvailability.Filled);
        expect(ticketAvailability({ ...base, opensAt: "2026-10-20T00:00:00.000Z" }, now)).toBe(TicketAvailability.Upcoming);
        expect(ticketAvailability({ ...base, closesAt: "2026-10-19T11:00:00.000Z" }, now)).toBe(TicketAvailability.WindowClosed);
        expect(ticketAvailability({ ...base, kind: TicketKind.Support, filledCount: 5 }, now)).toBe(TicketAvailability.Available);
    });
});
