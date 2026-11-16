import {
    ApplicationStage,
    NotificationType,
    PositionStatus,
    TicketAvailability,
    TicketEventKind,
    TicketKind,
    TicketMessageSource,
    TicketQuestionStyle,
    TicketStatus,
    type PublicPositionsDto,
    type TicketAccessDto,
    type TicketCategoryDto,
    type TicketConfigDto,
    type TicketDetailDto,
    type TicketDto,
    type TicketHubDto,
    type TicketMessageDto,
    type TicketSummaryDto,
    type TicketTypeDto
} from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { createTestContext, json, nextSnowflake, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("tickets API", () => {
    let context: TestContext;
    let admin: TestUser;
    let supervisor: TestUser;
    let outsider: TestUser;
    let category: TicketCategoryDto;
    let otherCategory: TicketCategoryDto;
    let supportType: TicketTypeDto;
    let positionType: TicketTypeDto;
    let hiddenType: TicketTypeDto;
    const serviceHeaders = { authorization: `Bearer ${serviceToken}` };
    const staffRole = "300000000000000001";
    const guildId = "500000000000000001";

    function opener(): { discordId: string; username: string } {
        return { discordId: nextSnowflake(), username: "applicant" };
    }

    async function inject(
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        url: string,
        headers: Record<string, string>,
        payload?: unknown
    ): Promise<LightMyRequestResponse> {
        return context.application.inject({ method, url: `/api/v1${url}`, headers, payload: payload as never });
    }

    async function openTicket(typeId: string, answers: { questionId: string; value: string }[] = [], who = opener()): Promise<TicketDto> {
        const response = await inject("POST", "/tickets", serviceHeaders, { typeId, opener: who, answers });
        expect(response.statusCode).toBe(201);
        return json<{ data: TicketDto }>(response).data;
    }

    async function bindThread(ticket: TicketDto): Promise<string> {
        const threadId = nextSnowflake();
        expect((await inject("PATCH", `/tickets/${ticket.id}`, serviceHeaders, { threadId })).statusCode).toBe(200);
        return threadId;
    }

    function activity(kind: TicketEventKind): number {
        return context.notifier.notifications.filter((n) => n.type === NotificationType.TicketActivity && n.kind === kind).length;
    }

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        supervisor = await context.createUser(Role.Supervisor);
        outsider = await context.createUser(Role.Supervisor);
        await inject("PUT", "/discord/directory", serviceHeaders, {
            guildId,
            channels: [{ id: "500000000000000002", name: "tickets", kind: "text", parentId: null, position: 0 }],
            roles: [{ id: staffRole, name: "Animation Supervisor", color: 0, position: 3, isManaged: false }],
            members: [
                { id: supervisor.record.discordId, username: "sup", displayName: "Sup", avatarUrl: null, roleIds: [staffRole] },
                { id: outsider.record.discordId, username: "out", displayName: "Out", avatarUrl: null, roleIds: [] }
            ]
        });
    });

    afterAll(async () => {
        await context.close();
    });

    it("keeps configuration to admins", async () => {
        expect((await inject("POST", "/tickets/categories", supervisor.headers, { name: "Production" })).statusCode).toBe(403);
        expect((await context.application.inject({ method: "GET", url: "/api/v1/tickets/config" })).statusCode).toBe(401);
        expect((await inject("GET", "/tickets/config", supervisor.headers)).statusCode).toBe(200);
    });

    it("builds categories and types", async () => {
        const created = await inject("POST", "/tickets/categories", admin.headers, {
            name: "Production",
            staffRoleIds: [staffRole],
            threadChannelId: "500000000000000002"
        });
        expect(created.statusCode).toBe(201);
        category = json<{ data: TicketCategoryDto }>(created).data;
        otherCategory = json<{ data: TicketCategoryDto }>(
            await inject("POST", "/tickets/categories", admin.headers, { name: "Server" })
        ).data;

        supportType = json<{ data: TicketTypeDto }>(
            await inject("POST", "/tickets/types", admin.headers, {
                categoryId: category.id,
                name: "General question",
                kind: TicketKind.Support
            })
        ).data;
        hiddenType = json<{ data: TicketTypeDto }>(
            await inject("POST", "/tickets/types", admin.headers, {
                categoryId: otherCategory.id,
                name: "Moderation report",
                kind: TicketKind.Support
            })
        ).data;
        const position = await inject("POST", "/tickets/types", admin.headers, {
            categoryId: category.id,
            name: "Animation Supervisor",
            kind: TicketKind.Application,
            openings: 1,
            questions: [
                {
                    id: "experience",
                    label: "Relevant experience",
                    placeholder: null,
                    style: TicketQuestionStyle.Paragraph,
                    required: true,
                    minLength: 10,
                    maxLength: 1000
                }
            ],
            listing: {
                overview: "Lead the animation department.",
                requirements: ["Must be 18 or older by the time you start"],
                responsibilities: ["Oversee daily operations of the department"],
                process: "You will be invited to an interview in your ticket.",
                about: ""
            }
        });
        expect(position.statusCode).toBe(201);
        positionType = json<{ data: TicketTypeDto }>(position).data;
        expect(positionType.availability).toBe(TicketAvailability.Available);
    });

    it("manages hubs and tells the bot which messages to remove", async () => {
        const created = await inject("POST", "/tickets/hubs", admin.headers, {
            name: "Main hub",
            channelId: "500000000000000002",
            title: "Open a ticket",
            categoryIds: [category.id]
        });
        expect(created.statusCode).toBe(201);
        const hub = json<{ data: TicketHubDto }>(created).data;

        expect((await inject("PUT", `/tickets/hubs/${hub.id}/message`, admin.headers, { messageId: nextSnowflake() })).statusCode).toBe(
            403
        );
        const messageId = nextSnowflake();
        expect((await inject("PUT", `/tickets/hubs/${hub.id}/message`, serviceHeaders, { messageId })).statusCode).toBe(200);

        const moved = await inject("PATCH", `/tickets/hubs/${hub.id}`, admin.headers, { channelId: "500000000000000003" });
        expect(json<{ data: TicketHubDto }>(moved).data.messageId).toBeNull();
        const last = context.notifier.notifications.at(-1);
        expect(last?.type === NotificationType.TicketConfigUpdated && last.removedHubs).toEqual([
            { channelId: "500000000000000002", messageId }
        ]);

        expect(
            (await inject("POST", "/tickets/hubs", admin.headers, { name: "Bad", title: "x", categoryIds: [nextSnowflake()] })).statusCode
        ).toBe(400);
        await inject("PATCH", `/tickets/hubs/${hub.id}`, admin.headers, { channelId: "500000000000000002" });
    });

    it("validates answers and limits open tickets per member", async () => {
        expect(
            (await inject("POST", "/tickets", serviceHeaders, { typeId: positionType.id, opener: opener(), answers: [] })).statusCode
        ).toBe(400);
        expect(
            (
                await inject("POST", "/tickets", serviceHeaders, {
                    typeId: supportType.id,
                    opener: opener(),
                    answers: [{ questionId: "nope", value: "x" }]
                })
            ).statusCode
        ).toBe(400);
        expect((await inject("POST", "/tickets", admin.headers, { typeId: supportType.id, opener: opener() })).statusCode).toBe(403);

        await inject("PUT", "/tickets/settings", admin.headers, { maxOpenPerUser: 1 });
        const who = opener();
        await openTicket(supportType.id, [], who);
        const second = await inject("POST", "/tickets", serviceHeaders, { typeId: hiddenType.id, opener: who });
        expect(second.statusCode).toBe(409);
        expect(json(second).code).toBe("TICKET_UNAVAILABLE");
        await inject("PUT", "/tickets/settings", admin.headers, { maxOpenPerUser: 3 });

        const duplicate = await inject("POST", "/tickets", serviceHeaders, { typeId: supportType.id, opener: who });
        expect(json(duplicate).code).toBe("DUPLICATE_TICKET");
    });

    it("scopes supervisors to the tickets their roles staff", async () => {
        const visible = await openTicket(supportType.id);
        const hidden = await openTicket(hiddenType.id);

        expect((await inject("GET", `/tickets/${visible.id}`, supervisor.headers)).statusCode).toBe(200);
        expect((await inject("GET", `/tickets/${hidden.id}`, supervisor.headers)).statusCode).toBe(404);
        expect((await inject("GET", `/tickets/${visible.id}`, outsider.headers)).statusCode).toBe(404);
        expect((await inject("POST", `/tickets/${hidden.id}/close`, supervisor.headers, {})).statusCode).toBe(404);

        const list = json<{ data: TicketDto[] }>(await inject("GET", "/tickets?perPage=100", supervisor.headers)).data;
        expect(list.some((ticket) => ticket.id === visible.id)).toBe(true);
        expect(list.some((ticket) => ticket.id === hidden.id)).toBe(false);
        expect(json<{ data: TicketDto[] }>(await inject("GET", "/tickets", outsider.headers)).data).toEqual([]);

        const access = json<{ data: TicketAccessDto }>(await inject("GET", "/tickets/access", supervisor.headers)).data;
        expect(access).toEqual({ canConfigure: false, isAllCategories: false, categoryIds: [category.id] });
        expect(json<{ data: TicketAccessDto }>(await inject("GET", "/tickets/access", admin.headers)).data.isAllCategories).toBe(true);
    });

    it("runs an application review from the web and fills the seat", async () => {
        const answers = [{ questionId: "experience", value: "Five years animating short films." }];
        const application = await openTicket(positionType.id, answers);
        await bindThread(application);

        const interview = await inject("POST", `/tickets/${application.id}/stage`, supervisor.headers, {
            stage: ApplicationStage.Interview
        });
        expect(interview.statusCode).toBe(200);
        expect(activity(TicketEventKind.StageChanged)).toBeGreaterThan(0);

        const accepted = await inject("POST", `/tickets/${application.id}/stage`, supervisor.headers, {
            stage: ApplicationStage.Accepted,
            note: "Welcome aboard"
        });
        const decided = json<{ data: TicketDto }>(accepted).data;
        expect(decided.decidedBy?.discordId).toBe(supervisor.record.discordId);
        expect(decided.decisionNote).toBe("Welcome aboard");

        expect(
            (await inject("POST", `/tickets/${application.id}/stage`, supervisor.headers, { stage: ApplicationStage.Interview })).statusCode
        ).toBe(409);

        const config = json<{ data: TicketConfigDto }>(await inject("GET", "/tickets/config", admin.headers)).data;
        const filled = config.categories.flatMap((item) => item.types).find((type) => type.id === positionType.id);
        expect(filled?.positionStatus).toBe(PositionStatus.Filled);
        expect(filled?.availability).toBe(TicketAvailability.Filled);

        const late = await inject("POST", "/tickets", serviceHeaders, { typeId: positionType.id, opener: opener(), answers });
        expect(json(late).code).toBe("TICKET_UNAVAILABLE");
        await inject("PATCH", `/tickets/types/${positionType.id}`, admin.headers, {
            positionStatus: PositionStatus.Open,
            resetFilledCount: true
        });
    });

    it("stops staff from deciding their own application", async () => {
        const own = await openTicket(positionType.id, [{ questionId: "experience", value: "I would like to lead animation." }], {
            discordId: supervisor.record.discordId,
            username: "sup"
        });
        expect(
            (await inject("POST", `/tickets/${own.id}/stage`, supervisor.headers, { stage: ApplicationStage.Accepted })).statusCode
        ).toBe(403);
    });

    it("requires the bot to name the actor", async () => {
        const ticket = await openTicket(supportType.id);
        expect((await inject("POST", `/tickets/${ticket.id}/close`, serviceHeaders, {})).statusCode).toBe(400);
    });

    it("assigns, notes, adds members, closes and reopens from the web", async () => {
        const ticket = await openTicket(supportType.id);
        expect((await inject("POST", `/tickets/${ticket.id}/members`, supervisor.headers, { member: opener() })).statusCode).toBe(409);
        await bindThread(ticket);

        const assigned = await inject("POST", `/tickets/${ticket.id}/assign`, supervisor.headers, {
            assignee: { discordId: supervisor.record.discordId, username: "sup" }
        });
        expect(json<{ data: TicketDto }>(assigned).data.assignee?.discordId).toBe(supervisor.record.discordId);

        expect((await inject("POST", `/tickets/${ticket.id}/members`, supervisor.headers, { member: opener() })).statusCode).toBe(200);
        expect(activity(TicketEventKind.MemberAdded)).toBe(1);

        const notesBefore = activity(TicketEventKind.Note);
        expect(
            (await inject("POST", `/tickets/${ticket.id}/notes`, supervisor.headers, { content: "Checked their portfolio." })).statusCode
        ).toBe(201);
        expect(activity(TicketEventKind.Note)).toBe(notesBefore);

        expect((await inject("POST", `/tickets/${ticket.id}/close`, supervisor.headers, { reason: "Resolved" })).statusCode).toBe(200);
        expect((await inject("POST", `/tickets/${ticket.id}/close`, supervisor.headers, {})).statusCode).toBe(409);
        expect((await inject("POST", `/tickets/${ticket.id}/replies`, supervisor.headers, { content: "hello" })).statusCode).toBe(409);
        expect((await inject("POST", `/tickets/${ticket.id}/reopen`, supervisor.headers, {})).statusCode).toBe(200);

        const detail = json<{ data: TicketDetailDto }>(await inject("GET", `/tickets/${ticket.id}/detail`, supervisor.headers)).data;
        expect(detail.events.map((event) => event.kind)).toEqual([
            TicketEventKind.Opened,
            TicketEventKind.Assigned,
            TicketEventKind.MemberAdded,
            TicketEventKind.Note,
            TicketEventKind.Closed,
            TicketEventKind.Reopened
        ]);
        expect(detail.guildId).toBe(guildId);

        const summary = json<{ data: TicketSummaryDto }>(await inject("GET", "/tickets/summary", supervisor.headers)).data;
        expect(summary.mine).toBe(1);
    });

    it("relays web replies and records the thread conversation", async () => {
        const ticket = await openTicket(supportType.id);
        await bindThread(ticket);

        const sent = await inject("POST", `/tickets/${ticket.id}/replies`, supervisor.headers, { content: "Thanks, looking into it." });
        expect(sent.statusCode).toBe(201);
        const reply = json<{ data: TicketMessageDto }>(sent).data;
        expect(reply.source).toBe(TicketMessageSource.Web);
        const relayed = context.notifier.notifications.at(-1);
        expect(relayed?.type === NotificationType.TicketActivity && relayed.reply?.content).toBe("Thanks, looking into it.");
        expect((await inject("POST", `/tickets/${ticket.id}/replies`, serviceHeaders, { content: "x" })).statusCode).toBe(403);

        const linkedId = nextSnowflake();
        expect(
            (await inject("PUT", `/tickets/${ticket.id}/replies/${reply.id}/link`, serviceHeaders, { discordMessageId: linkedId }))
                .statusCode
        ).toBe(204);

        const discordMessageId = nextSnowflake();
        const message = {
            discordMessageId,
            author: ticket.opener,
            content: "Here is my question",
            attachments: [{ name: "shot.png", url: "https://cdn.discordapp.com/a/shot.png", contentType: "image/png" }],
            createdAt: new Date().toISOString()
        };
        expect((await inject("PUT", `/tickets/${ticket.id}/messages`, serviceHeaders, { messages: [message] })).statusCode).toBe(200);
        await inject("PUT", `/tickets/${ticket.id}/messages`, serviceHeaders, {
            messages: [{ ...message, content: "Here is my edited question", editedAt: new Date().toISOString() }]
        });
        let detail = json<{ data: TicketDetailDto }>(await inject("GET", `/tickets/${ticket.id}/detail`, admin.headers)).data;
        expect(detail.messages).toHaveLength(2);
        expect(detail.messages.find((item) => item.discordMessageId === discordMessageId)?.content).toBe("Here is my edited question");

        expect((await inject("DELETE", `/tickets/${ticket.id}/messages/${discordMessageId}`, serviceHeaders)).statusCode).toBe(204);
        detail = json<{ data: TicketDetailDto }>(await inject("GET", `/tickets/${ticket.id}/detail`, admin.headers)).data;
        const removed = detail.messages.find((item) => item.discordMessageId === discordMessageId);
        expect(removed?.deletedAt).not.toBeNull();
        expect(removed?.content).toBe("");
    });

    it("searches by number and member", async () => {
        const ticket = await openTicket(supportType.id, [], { discordId: nextSnowflake(), username: "findme_user" });
        const byName = json<{ data: TicketDto[] }>(await inject("GET", "/tickets?search=findme", admin.headers)).data;
        expect(byName.map((item) => item.id)).toEqual([ticket.id]);
        const byNumber = json<{ data: TicketDto[] }>(await inject("GET", `/tickets?search=%23${ticket.number}`, admin.headers)).data;
        expect(byNumber.map((item) => item.id)).toContain(ticket.id);
    });

    it("publishes positions with a link to the hub that shows them", async () => {
        const positions = json<{ data: PublicPositionsDto }>(
            await context.application.inject({ method: "GET", url: "/api/v1/positions" })
        ).data;
        expect(positions.positions).toHaveLength(1);
        expect(positions.positions[0]?.applyUrl).toBe(`https://discord.com/channels/${guildId}/500000000000000002`);
        expect(positions.positions[0]).not.toHaveProperty("staffRoleIds");
    });

    it("keeps past tickets when a category is deleted", async () => {
        const ticket = await openTicket(hiddenType.id);
        expect((await inject("DELETE", `/tickets/categories/${otherCategory.id}`, admin.headers)).statusCode).toBe(204);
        const kept = json<{ data: TicketDto }>(await inject("GET", `/tickets/${ticket.id}`, admin.headers)).data;
        expect(kept.typeId).toBeNull();
        expect(kept.categoryName).toBe("Server");
        expect(kept.status).toBe(TicketStatus.Open);
    });
});
