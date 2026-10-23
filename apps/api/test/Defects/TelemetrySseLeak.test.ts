import { NotificationType, PollType, TicketEventKind } from "@platform/contracts";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "../../src/Domain/Roles.js";
import { createTestContext, type TestContext, type TestUser } from "../Support/TestApplication.js";

describe("TelemetrySseLeak defect reproducer (B2)", () => {
    let context: TestContext;
    let supervisor: TestUser;
    let sseUrl: string;

    beforeAll(async () => {
        context = await createTestContext();
        supervisor = await context.createUser(Role.Supervisor);

        // start listening on ephemeral port for sse stream inspection
        await context.application.listen({ port: 0, host: "127.0.0.1" });
        const address = context.application.server.address() as AddressInfo;
        sseUrl = `http://127.0.0.1:${address.port}/api/v1/telemetry/activity/stream`;
    });

    afterAll(async () => {
        await context.close();
    });

    it("filters privateActivityTypes from real-time SSE stream", async () => {
        const controller = new AbortController();
        const response = await fetch(sseUrl, {
            headers: supervisor.headers,
            signal: controller.signal
        });

        expect(response.status).toBe(200);
        expect(response.body).not.toBeNull();
        const reader = response.body!.getReader();

        // read initial sse retry handshake frame
        const initial = await reader.read();
        const initialText = new TextDecoder().decode(initial.value);
        expect(initialText).toContain("retry: 5000");

        // emit a confidential ticket activity notification
        context.notifier.notify({
            type: NotificationType.TicketActivity,
            ticketId: "8f1a2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
            eventId: "9a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
            kind: TicketEventKind.StageChanged,
            actor: { discordId: "123456789012345678", username: "staff" },
            stage: null,
            target: null,
            note: "Confidential disciplinary review note",
            reply: null
        });

        // emit public event following private notification
        context.notifier.notify({
            type: NotificationType.BallotSubmitted,
            round: {
                id: "7f1a2b3c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
                title: "Test Round",
                pollType: PollType.RankedChoice
            },
            voter: {
                discordId: "123456789012345678",
                username: "voter"
            },
            isChange: false
        });

        // read incoming event frame
        const activityFrame = await reader.read();
        const frameText = new TextDecoder().decode(activityFrame.value);

        controller.abort();
        reader.releaseLock();

        // the sse stream must not leak confidential ticket activity but should deliver public events
        expect(frameText).not.toContain(NotificationType.TicketActivity);
        expect(frameText).not.toContain("Confidential disciplinary review note");
        expect(frameText).toContain(NotificationType.BallotSubmitted);
    });
});
