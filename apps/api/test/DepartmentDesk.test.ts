import { NotificationType, TicketKind, type DepartmentDeskDto, type TicketConfigDto } from "@platform/contracts";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../src/Domain/Roles.js";
import { departments } from "../src/Infrastructure/Database/Schema.js";
import { createTestContext, json, serviceToken, type TestContext, type TestUser } from "./Support/TestApplication.js";

describe("department ticket desks", () => {
    let context: TestContext;
    let admin: TestUser;
    let departmentId: string;
    let departmentName: string;
    const serviceHeaders = { authorization: `Bearer ${serviceToken}` };
    const applyChannelId = "700000000000000001";
    const logsChannelId = "700000000000000002";
    const staffRole = "700000000000000003";

    async function ensure(headers: Record<string, string>, body: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
        return context.application.inject({
            method: "PUT",
            url: `/api/v1/tickets/departments/${departmentId}/desk`,
            headers,
            payload: { departmentName, applyChannelId, notificationChannelId: logsChannelId, staffRoleIds: [staffRole], ...body }
        });
    }

    async function config(): Promise<TicketConfigDto> {
        return json<{ data: TicketConfigDto }>(
            await context.application.inject({ method: "GET", url: "/api/v1/tickets/config", headers: admin.headers })
        ).data;
    }

    beforeAll(async () => {
        context = await createTestContext();
        admin = await context.createUser(Role.Admin);
        const [department] = await context.database.select().from(departments).limit(1);
        if (department === undefined) {
            throw new Error("departments are seeded by migrations");
        }
        departmentId = department.id;
        departmentName = department.name;
    });

    afterAll(async () => {
        await context.close();
    });

    it("is only for the platform service", async () => {
        expect((await ensure(admin.headers)).statusCode).toBe(403);
    });

    it("creates an editable desk with default applications and an apply hub", async () => {
        const response = await ensure(serviceHeaders);
        expect(response.statusCode).toBe(200);
        const desk = json<{ data: DepartmentDeskDto }>(response).data;
        expect(desk.created).toBe(true);
        expect(context.notifier.notifications.at(-1)?.type).toBe(NotificationType.TicketConfigUpdated);

        const { categories, hubs } = await config();
        const category = categories.find((candidate) => candidate.departmentId === departmentId);
        expect(category?.threadChannelId).toBe(applyChannelId);
        expect(category?.notificationChannelId).toBe(logsChannelId);
        expect(category?.staffRoleIds).toEqual([staffRole]);
        expect(category?.types.map((type) => type.kind)).toEqual([TicketKind.Application, TicketKind.Support]);
        expect(category?.types[0]?.listing?.overview).toContain(departmentName);
        expect(category?.types[0]?.questions.length).toBeGreaterThan(0);

        const hub = hubs.find((candidate) => candidate.departmentId === departmentId);
        expect(hub?.channelId).toBe(applyChannelId);
        expect(hub?.categoryIds).toEqual([desk.categoryId]);
    });

    it("keeps panel edits when the bot sets the desk up again", async () => {
        const before = await config();
        const category = before.categories.find((candidate) => candidate.departmentId === departmentId);
        await context.application.inject({
            method: "PATCH",
            url: `/api/v1/tickets/categories/${category?.id ?? ""}`,
            headers: admin.headers,
            payload: { name: "Renamed by leadership", staffRoleIds: ["700000000000000009"] }
        });

        const notifications = context.notifier.notifications.length;
        const again = json<{ data: DepartmentDeskDto }>(await ensure(serviceHeaders, { applyChannelId: "700000000000000010" })).data;
        expect(again).toMatchObject({ created: false, changed: false });
        expect(context.notifier.notifications.length).toBe(notifications);

        const after = await config();
        const kept = after.categories.find((candidate) => candidate.departmentId === departmentId);
        expect(kept?.name).toBe("Renamed by leadership");
        expect(kept?.staffRoleIds).toEqual(["700000000000000009"]);
        expect(kept?.threadChannelId).toBe(applyChannelId);
        expect(after.categories.filter((candidate) => candidate.departmentId === departmentId)).toHaveLength(1);
        expect(after.hubs.filter((hub) => hub.departmentId === departmentId)).toHaveLength(1);
    });

    it("fills a channel that was cleared", async () => {
        const hub = (await config()).hubs.find((candidate) => candidate.departmentId === departmentId);
        await context.application.inject({
            method: "PATCH",
            url: `/api/v1/tickets/hubs/${hub?.id ?? ""}`,
            headers: admin.headers,
            payload: { channelId: null }
        });
        const desk = json<{ data: DepartmentDeskDto }>(await ensure(serviceHeaders)).data;
        expect(desk.changed).toBe(true);
        expect((await config()).hubs.find((candidate) => candidate.departmentId === departmentId)?.channelId).toBe(applyChannelId);
    });

    it("rejects unknown departments", async () => {
        const response = await context.application.inject({
            method: "PUT",
            url: "/api/v1/tickets/departments/00000000-0000-4000-8000-000000000000/desk",
            headers: serviceHeaders,
            payload: { departmentName: "Ghost", applyChannelId }
        });
        expect(response.statusCode).toBe(404);
    });
});
