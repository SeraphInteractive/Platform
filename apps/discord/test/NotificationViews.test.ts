import {
    DifficultyTier,
    EntryStatus,
    NotificationType,
    platformNotificationSchema,
    PollType,
    RaidFlag,
    RaidSeverity,
    ReviewDecision,
    RoundStatus,
    type PlatformNotification
} from "@platform/contracts";
import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import type { V2Message } from "../src/Discord/Ui.js";
import { ChannelPurpose } from "../src/State/SettingsStore.js";
import { renderNotification } from "../src/Views/NotificationViews.js";
import { reviewCard, threadUpdate } from "../src/Views/TaskViews.js";

const occurredAt = "2026-09-27T01:08:00.000Z";
const round = { id: "5d2d7d9a-2c1f-4d4e-9d7e-0a7b3c1f9e11", title: "Binary Test Round", pollType: PollType.Binary };
const voter = { discordId: "215537065863938049", username: "TestVoterBL" };
const admin = { discordId: "212401207694721024", username: "AdminBL" };
const supervisor = { discordId: "364539598942240768", username: "yancovert" };
const shot = {
    id: "0c6f0a53-7d47-4a36-9d4e-5a1d2e3f4b5c",
    code: "SC01_A1B2",
    title: "Opening pan",
    sceneNumber: 1,
    difficulty: DifficultyTier.Hard
};
const context = { threadFor: (): string | undefined => "1100000000000000001" };

interface ComponentJson {
    readonly type: number;
    readonly content?: string;
    readonly components?: readonly ComponentJson[];
    readonly accent_color?: number;
}

function texts(payload: V2Message): string[] {
    const collected: string[] = [];
    const visit = (component: ComponentJson): void => {
        if (typeof component.content === "string") {
            collected.push(component.content);
        }
        component.components?.forEach(visit);
    };
    for (const component of payload.components) {
        visit(component.toJSON() as ComponentJson);
    }
    return collected;
}

function only(notification: PlatformNotification): { purpose: ChannelPurpose; text: string; payload: V2Message } {
    const rendered = renderNotification(notification, context);
    expect(rendered).toHaveLength(1);
    const [first] = rendered;
    if (first === undefined) {
        throw new Error("nothing rendered");
    }
    return { purpose: first.purpose, text: texts(first.message).join("\n"), payload: first.message };
}

describe("telemetry alerts", () => {
    it("renders a blocked vote with only the facts", () => {
        const { purpose, text } = only({
            type: NotificationType.BallotBlocked,
            occurredAt,
            round,
            voter,
            reason: "Suspected botting script"
        });
        expect(purpose).toBe(ChannelPurpose.Telemetry);
        expect(text).toBe(
            [
                "**Blocked vote in Binary Test Round**",
                "<@215537065863938049> is banned from voting.",
                "-# Reason: Suspected botting script"
            ].join("\n")
        );
    });

    it("renders a rejected entry without calling it a quarantine", () => {
        const { text } = only({
            type: NotificationType.EntryStatusChanged,
            occurredAt,
            round,
            entry: { id: "a0f3d5c7-1b2e-4c3d-8e9f-0a1b2c3d4e5f", title: "Option Beta" },
            status: EntryStatus.Rejected,
            author: null,
            actor: supervisor
        });
        expect(text).toBe(["**Entry rejected**", "Option Beta in Binary Test Round", "-# By <@364539598942240768>"].join("\n"));
    });

    it("renders a ballot as a single sentence", () => {
        const { text } = only({
            type: NotificationType.BallotSubmitted,
            occurredAt,
            round,
            voter,
            picks: [{ id: "b1f3d5c7-1b2e-4c3d-8e9f-0a1b2c3d4e5f", title: "Option Alpha" }],
            isChange: false
        });
        expect(text).toBe(["**Vote in Binary Test Round**", "<@215537065863938049> voted for Option Alpha"].join("\n"));
    });

    it("renders ranked ballots and changed votes", () => {
        const { text } = only({
            type: NotificationType.BallotSubmitted,
            occurredAt,
            round: { ...round, pollType: PollType.RankedChoice },
            voter,
            picks: ["A", "B", "C"].map((title, index) => ({ id: `b1f3d5c7-1b2e-4c3d-8e9f-0a1b2c3d4e5${index}`, title })),
            isChange: true
        });
        expect(text).toContain("changed their ranking to 1. A  2. B  3. C");
    });

    it("renders a ban with actor and reason", () => {
        const { text } = only({
            type: NotificationType.UserBlacklisted,
            occurredAt,
            user: voter,
            actor: admin,
            reason: "Suspected botting script"
        });
        expect(text).toBe(
            ["**Banned from voting**", "<@215537065863938049>, by <@212401207694721024>", "-# Reason: Suspected botting script"].join("\n")
        );
    });

    it("omits empty reasons instead of printing placeholders", () => {
        const { text } = only({ type: NotificationType.BallotBlocked, occurredAt, round, voter, reason: null });
        expect(text).not.toMatch(/reason|no reason|n\/a/iu);
    });

    it("explains raid alerts in plain language", () => {
        const { text } = only({
            type: NotificationType.RaidAlert,
            occurredAt,
            round,
            entry: { id: "a0f3d5c7-1b2e-4c3d-8e9f-0a1b2c3d4e5f", title: "Option Beta" },
            severity: RaidSeverity.CriticalRaid,
            flags: [RaidFlag.AnomalousVelocityBurst],
            velocityZScore: 4.24,
            quarantined: true
        });
        expect(text).toBe(
            [
                "**Quarantined Option Beta**",
                "In Binary Test Round. Flagged because votes are coming in 4.2σ above the past hour. It is off the ballot until someone reinstates it."
            ].join("\n")
        );
    });

    it("never lets user content ping or inject markdown", () => {
        const { text, payload } = only({
            type: NotificationType.EntrySubmitted,
            occurredAt,
            round: { ...round, title: "@everyone **free nitro**" },
            entry: { id: "a0f3d5c7-1b2e-4c3d-8e9f-0a1b2c3d4e5f", title: "<@&123456789012345678> [link](https://evil.test)" },
            status: EntryStatus.PendingReview,
            author: { discordId: null, username: "@here" }
        });
        expect(text).not.toMatch(/@everyone|@here|<@&|(?<!\\)\*\*free|(?<!\\)\[link\]\(/u);
        expect(payload.allowedMentions.parse).toEqual([]);
    });
});

describe("every notification", () => {
    const samples: PlatformNotification[] = [
        { type: NotificationType.BallotSubmitted, occurredAt, round, voter, picks: [{ id: shot.id, title: "A" }], isChange: false },
        { type: NotificationType.BallotBlocked, occurredAt, round, voter, reason: null },
        { type: NotificationType.UserBlacklisted, occurredAt, user: voter, actor: admin, reason: null },
        { type: NotificationType.UserReinstated, occurredAt, user: voter, actor: admin },
        { type: NotificationType.ContributorPromoted, occurredAt, user: voter, actor: admin },
        {
            type: NotificationType.RaidAlert,
            occurredAt,
            round,
            entry: { id: shot.id, title: "A" },
            severity: RaidSeverity.Suspicious,
            flags: [],
            velocityZScore: 2,
            quarantined: false
        },
        { type: NotificationType.RoundCreated, occurredAt, round, actor: admin, opensAt: null, closesAt: occurredAt },
        { type: NotificationType.RoundUpdated, occurredAt, round, actor: admin, opensAt: null, closesAt: occurredAt },
        { type: NotificationType.RoundStatusChanged, occurredAt, round, from: RoundStatus.Closed, to: RoundStatus.Open, actor: admin },
        {
            type: NotificationType.RoundFinalized,
            occurredAt,
            round,
            totalBallots: 40,
            winner: { entryId: shot.id, title: "Option Alpha", rawScore: 25, voteSharePercentage: 62.5, regularizedTotalScore: null },
            actor: admin
        },
        {
            type: NotificationType.EntrySubmitted,
            occurredAt,
            round,
            entry: { id: shot.id, title: "A" },
            status: EntryStatus.Approved,
            author: voter
        },
        {
            type: NotificationType.EntryStatusChanged,
            occurredAt,
            round,
            entry: { id: shot.id, title: "A" },
            status: EntryStatus.Flagged,
            author: voter,
            actor: admin
        },
        { type: NotificationType.EntryReinstated, occurredAt, round, entry: { id: shot.id, title: "A" }, actor: admin },
        { type: NotificationType.ShotCreated, occurredAt, shot },
        { type: NotificationType.ShotUpdated, occurredAt, shot },
        { type: NotificationType.ShotDeleted, occurredAt, shot },
        { type: NotificationType.ShotClaimed, occurredAt, shot, claimant: voter, deadlineAt: occurredAt },
        { type: NotificationType.ShotReleased, occurredAt, shot, actor: voter, reason: "Out of time" },
        { type: NotificationType.ShotExpired, occurredAt, shot, claimant: null },
        {
            type: NotificationType.SubmissionCreated,
            occurredAt,
            shot,
            submissionId: shot.id,
            version: 2,
            contributor: voter,
            notes: "Frames 10-20"
        },
        {
            type: NotificationType.SubmissionReviewed,
            occurredAt,
            shot,
            submissionId: shot.id,
            version: 2,
            decision: ReviewDecision.Approved,
            contributor: voter,
            reviewer: supervisor,
            notes: null
        },
        {
            type: NotificationType.PipelineUpdated,
            occurredAt,
            stepId: "1.1",
            stepTitle: "Art Style",
            phaseNumber: 1,
            phaseTitle: "Phase 1: Animatic",
            progressPercent: 18,
            isPhaseTransition: true,
            actor: supervisor
        }
    ];

    it("covers every notification type", () => {
        expect(new Set(samples.map((sample) => sample.type))).toEqual(new Set(Object.values(NotificationType)));
    });

    it.each(samples.map((sample) => [sample.type, sample] as const))("%s renders as a components v2 message", (_type, sample) => {
        expect(platformNotificationSchema.safeParse(sample).success).toBe(true);
        for (const rendered of renderNotification(sample, context)) {
            expect(rendered.message.flags & MessageFlags.IsComponentsV2).toBe(MessageFlags.IsComponentsV2);
            expect(rendered.message).not.toHaveProperty("embeds");
            expect(rendered.message).not.toHaveProperty("content");
            for (const line of texts(rendered.message)) {
                expect(line.length).toBeLessThanOrEqual(4000);
                expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
            }
        }
    });

    it("announces winners publicly", () => {
        const sample = samples.find((s) => s.type === NotificationType.RoundFinalized)!;
        const [rendered] = renderNotification(sample, context);
        expect(rendered?.purpose).toBe(ChannelPurpose.Announcements);
        expect(texts(rendered?.message as V2Message).join("\n")).toContain("**Option Alpha** wins with 62.5% of the vote.");
    });

    it("announces when a round is opened for voting", () => {
        const sample = samples.find((s) => s.type === NotificationType.RoundStatusChanged)!;
        const rendered = renderNotification(sample, context);
        expect(rendered).toHaveLength(2);
        const announcement = rendered.find((r) => r.purpose === ChannelPurpose.Announcements);
        expect(announcement).toBeDefined();
        expect(texts(announcement!.message).join("\n")).toContain("## Voting is now open for Binary Test Round!");
    });

    it("announces phase unlocks and step progress to announcements channel", () => {
        const phaseUnlock = only({
            type: NotificationType.PipelineUpdated,
            occurredAt,
            stepId: "2.1",
            stepTitle: "3D Modelling",
            phaseNumber: 2,
            phaseTitle: "Phase 2: LookDev",
            progressPercent: 36,
            isPhaseTransition: true,
            actor: supervisor
        });
        expect(phaseUnlock.purpose).toBe(ChannelPurpose.Announcements);
        expect(phaseUnlock.text).toContain("## Phase 2 Unlocked: Phase 2: LookDev");
        expect(phaseUnlock.text).toContain("3D Modelling");
        expect(phaseUnlock.text).toContain("36% overall completed");

        const stepProgress = only({
            type: NotificationType.PipelineUpdated,
            occurredAt,
            stepId: "2.2",
            stepTitle: "Rigging and Deformation",
            phaseNumber: 2,
            phaseTitle: "Phase 2: LookDev",
            progressPercent: 41,
            isPhaseTransition: false,
            actor: supervisor
        });
        expect(stepProgress.purpose).toBe(ChannelPurpose.Announcements);
        expect(stepProgress.text).toContain("Rigging and Deformation");
        expect(stepProgress.text).toContain("Phase 2: LookDev");
        expect(stepProgress.text).toContain("41% completed");
    });

    it("embeds image and video media thumbnails when mediaUrl or videoUrl is present", () => {
        const entryNotification = only({
            type: NotificationType.EntrySubmitted,
            occurredAt,
            round,
            entry: {
                id: shot.id,
                title: "Hero Design",
                mediaUrl: "https://dev-api.seraphinteractive.com/api/v1/uploads/media/file/hero.png"
            },
            status: EntryStatus.PendingReview,
            author: voter
        });
        const entryJson = entryNotification.payload.components.map((c) => c.toJSON() as ComponentJson);
        const hasMedia = entryJson.some(
            (c) => (c.components ?? []).some((child: unknown) => (child as { type?: number })?.type === 12)
        );
        expect(hasMedia).toBe(true);

        const winnerNotification = only({
            type: NotificationType.RoundFinalized,
            occurredAt,
            round,
            totalBallots: 40,
            winner: {
                entryId: shot.id,
                title: "Winning Art",
                mediaUrl: "https://dev-api.seraphinteractive.com/api/v1/uploads/media/file/winner.png",
                rawScore: 25,
                voteSharePercentage: 62.5,
                regularizedTotalScore: null
            },
            actor: admin
        });
        const winnerJson = winnerNotification.payload.components.map((c) => c.toJSON() as ComponentJson);
        const winnerHasMedia = winnerJson.some(
            (c) => (c.components ?? []).some((child: unknown) => (child as { type?: number })?.type === 12)
        );
        expect(winnerHasMedia).toBe(true);

        const submissionNotification = only({
            type: NotificationType.SubmissionCreated,
            occurredAt,
            shot,
            submissionId: shot.id,
            version: 1,
            videoUrl: "https://dev-api.seraphinteractive.com/api/v1/uploads/media/file/shot_v1.mp4",
            contributor: voter,
            notes: "Initial blockout"
        });
        const submissionJson = submissionNotification.payload.components.map((c) => c.toJSON() as ComponentJson);
        const subHasMedia = submissionJson.some(
            (c) => (c.components ?? []).some((child: unknown) => (child as { type?: number })?.type === 12)
        );
        expect(subHasMedia).toBe(true);
    });
});

describe("task views", () => {
    it("puts review actions on the review card with bounded custom ids", () => {
        const card = reviewCard(
            {
                type: NotificationType.SubmissionCreated,
                occurredAt,
                shot,
                submissionId: shot.id,
                version: 3,
                contributor: voter,
                notes: null
            },
            "1100000000000000001"
        );
        const json = card.components.map((component) => component.toJSON() as ComponentJson & { components?: { custom_id?: string }[] });
        const customIds = json
            .flatMap((component) => (component.components ?? []).map((child) => (child as { custom_id?: string }).custom_id))
            .filter(Boolean);
        expect(customIds).toHaveLength(3);
        for (const id of customIds) {
            expect((id ?? "").length).toBeLessThanOrEqual(100);
        }
    });

    it("tells contributors what to do after a revision request", () => {
        const update = threadUpdate({
            type: NotificationType.SubmissionReviewed,
            occurredAt,
            shot,
            submissionId: shot.id,
            version: 1,
            decision: ReviewDecision.RevisionRequested,
            contributor: voter,
            reviewer: supervisor,
            notes: "Tighten the timing"
        });
        expect(texts(update).join("\n")).toBe(
            [
                "<@364539598942240768> asked for changes to version 1.",
                "> Tighten the timing",
                "-# Upload a new version with /submit-task when it's ready."
            ].join("\n")
        );
    });
});
