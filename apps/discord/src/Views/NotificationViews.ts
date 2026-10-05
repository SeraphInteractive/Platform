import {
    EntryStatus,
    NotificationType,
    PollType,
    RaidFlag,
    ReviewDecision,
    RoundStatus,
    type NotificationOf,
    type PlatformNotification,
    type ShotReference
} from "@platform/contracts";
import { ChannelPurpose } from "../State/SettingsStore.js";
import { Accent, message, panel, person, plain, quote, when, type V2Message } from "../Discord/Ui.js";

export interface RenderedNotification {
    readonly purpose: ChannelPurpose;
    readonly message: V2Message;
}

export interface NotificationContext {
    threadFor(shotId: string): string | undefined;
}

function post(purpose: ChannelPurpose, accent: Accent | null, ...lines: readonly (string | null)[]): RenderedNotification {
    return { purpose, message: message(panel(accent, lines.filter((line): line is string => line !== null).join("\n"))) };
}

function reason(value: string | null): string | null {
    return value === null || value.trim().length === 0 ? null : `-# Reason: ${plain(value, 300)}`;
}

function shotName(shot: ShotReference): string {
    return `${plain(shot.code, 50)} · ${plain(shot.title, 120)}`;
}

function shotLink(shot: ShotReference, context: NotificationContext): string {
    const thread = context.threadFor(shot.id);
    return thread === undefined ? shotName(shot) : `${shotName(shot)} (<#${thread}>)`;
}

function describePicks(notification: NotificationOf<NotificationType.BallotSubmitted>): string {
    const titles = notification.picks.map((pick) => plain(pick.title, 80));
    const verb = notification.isChange ? "changed their vote to" : "voted for";
    if (notification.round.pollType === PollType.Binary || titles.length === 1) {
        return `${person(notification.voter)} ${verb} ${titles[0] ?? "an entry"}`;
    }
    const ranking = titles.map((title, index) => `${index + 1}. ${title}`).join("  ");
    return `${person(notification.voter)} ${notification.isChange ? "changed their ranking to" : "ranked"} ${ranking}`;
}

function describeRaid(notification: NotificationOf<NotificationType.RaidAlert>): string {
    const reasons: string[] = [];
    if (notification.flags.includes(RaidFlag.AnomalousVelocityBurst)) {
        reasons.push(`votes are coming in ${notification.velocityZScore.toFixed(1)}σ above the past hour`);
    }
    if (notification.flags.includes(RaidFlag.UnnaturalRank1HyperSkew) || notification.flags.includes(RaidFlag.CollapsedRankEntropy)) {
        reasons.push("nearly every ballot ranks it first");
    }
    const because = reasons.length === 0 ? "Its voting pattern looks unusual." : `Flagged because ${reasons.join(" and ")}.`;
    return notification.quarantined ? `${because} It is off the ballot until someone reinstates it.` : because;
}

function describeSchedule(opensAt: string | null, closesAt: string | null): string {
    const parts = [opensAt === null ? null : `opens ${when(opensAt)}`, closesAt === null ? null : `closes ${when(closesAt)}`].filter(
        (part): part is string => part !== null
    );
    return parts.length === 0 ? "not scheduled yet" : parts.join(", ");
}

const statusVerbs: Readonly<Record<RoundStatus, string>> = {
    [RoundStatus.Draft]: "moved back to draft",
    [RoundStatus.Open]: "is open for voting",
    [RoundStatus.Closed]: "closed",
    [RoundStatus.Finalized]: "was finalized"
};

const entryStatusHeadlines: Readonly<Record<EntryStatus, { title: string; accent: Accent | null }>> = {
    [EntryStatus.Approved]: { title: "Entry approved", accent: Accent.Success },
    [EntryStatus.Rejected]: { title: "Entry rejected", accent: Accent.Danger },
    [EntryStatus.Flagged]: { title: "Entry flagged", accent: Accent.Warning },
    [EntryStatus.PendingReview]: { title: "Entry sent back to review", accent: null }
};

export function describeWinner(notification: NotificationOf<NotificationType.RoundFinalized>): string {
    const winner = notification.winner;
    if (winner === null) {
        return "Voting ended without an eligible entry.";
    }
    if (notification.round.pollType === PollType.Binary) {
        return `**${plain(winner.title, 120)}** wins with ${winner.voteSharePercentage.toFixed(1)}% of the vote.`;
    }
    return `**${plain(winner.title, 120)}** wins with ${(winner.regularizedTotalScore ?? winner.rawScore).toFixed(1)} points.`;
}

export function renderNotification(notification: PlatformNotification, context: NotificationContext): RenderedNotification[] {
    const telemetry = ChannelPurpose.Telemetry;
    const taskLogs = ChannelPurpose.TaskLogs;
    switch (notification.type) {
        case NotificationType.BallotSubmitted:
            return [post(telemetry, null, `**Vote in ${plain(notification.round.title)}**`, describePicks(notification))];
        case NotificationType.BallotBlocked:
            return [
                post(
                    telemetry,
                    Accent.Danger,
                    `**Blocked vote in ${plain(notification.round.title)}**`,
                    `${person(notification.voter)} is banned from voting.`,
                    reason(notification.reason)
                )
            ];
        case NotificationType.UserBlacklisted:
            return [
                post(
                    telemetry,
                    Accent.Danger,
                    "**Banned from voting**",
                    `${person(notification.user)}, by ${person(notification.actor)}`,
                    reason(notification.reason)
                )
            ];
        case NotificationType.UserReinstated:
            return [
                post(telemetry, Accent.Success, "**Voting ban lifted**", `${person(notification.user)}, by ${person(notification.actor)}`)
            ];
        case NotificationType.ContributorPromoted:
            return [post(ChannelPurpose.Announcements, Accent.Success, `${person(notification.user)} is now a senior contributor.`)];
        case NotificationType.RaidAlert:
            return [
                post(
                    telemetry,
                    notification.quarantined ? Accent.Danger : Accent.Warning,
                    `**${notification.quarantined ? "Quarantined" : "Unusual voting on"} ${plain(notification.entry.title)}**`,
                    `In ${plain(notification.round.title)}. ${describeRaid(notification)}`
                )
            ];
        case NotificationType.RoundCreated:
            return [
                post(
                    telemetry,
                    Accent.Info,
                    `**New round: ${plain(notification.round.title)}**`,
                    `${notification.round.pollType === PollType.Binary ? "Binary" : "Ranked choice"}, ${describeSchedule(notification.opensAt, notification.closesAt)}`,
                    `-# Created by ${person(notification.actor)}`
                )
            ];
        case NotificationType.RoundStatusChanged:
            return [
                post(
                    telemetry,
                    notification.to === RoundStatus.Open ? Accent.Success : null,
                    `**${plain(notification.round.title)} ${notification.from === RoundStatus.Closed && notification.to === RoundStatus.Open ? "reopened" : statusVerbs[notification.to]}**`,
                    `-# By ${person(notification.actor)}`
                )
            ];
        case NotificationType.RoundFinalized:
            return [
                post(
                    ChannelPurpose.Announcements,
                    Accent.Info,
                    `## ${plain(notification.round.title)}`,
                    describeWinner(notification),
                    `-# ${notification.totalBallots.toLocaleString("en-US")} ${notification.totalBallots === 1 ? "ballot" : "ballots"} counted`
                )
            ];
        case NotificationType.EntrySubmitted:
            return [
                post(
                    telemetry,
                    null,
                    `**New entry in ${plain(notification.round.title)}**`,
                    `${plain(notification.entry.title)} by ${person(notification.author)}`,
                    notification.status === EntryStatus.PendingReview ? "-# Waiting for review" : "-# Approved automatically"
                )
            ];
        case NotificationType.EntryStatusChanged: {
            const headline = entryStatusHeadlines[notification.status];
            return [
                post(
                    telemetry,
                    headline.accent,
                    `**${headline.title}**`,
                    `${plain(notification.entry.title)} in ${plain(notification.round.title)}`,
                    `-# By ${person(notification.actor)}`
                )
            ];
        }
        case NotificationType.EntryReinstated:
            return [
                post(
                    telemetry,
                    Accent.Success,
                    "**Entry reinstated**",
                    `${plain(notification.entry.title)} is back on the ballot in ${plain(notification.round.title)}.`,
                    `-# By ${person(notification.actor)}`
                )
            ];
        case NotificationType.ShotCreated:
            return [post(taskLogs, null, `**Task created:** ${shotLink(notification.shot, context)}`)];
        case NotificationType.ShotUpdated:
            return [post(taskLogs, null, `**Task updated:** ${shotLink(notification.shot, context)}`)];
        case NotificationType.ShotDeleted:
            return [post(taskLogs, Accent.Warning, `**Task deleted:** ${shotName(notification.shot)}`)];
        case NotificationType.ShotClaimed:
            return [
                post(
                    taskLogs,
                    null,
                    `**Claimed:** ${shotLink(notification.shot, context)}`,
                    `${person(notification.claimant)}, due ${when(notification.deadlineAt)}`
                )
            ];
        case NotificationType.ShotReleased:
            return [
                post(
                    taskLogs,
                    null,
                    `**Released:** ${shotLink(notification.shot, context)}`,
                    `By ${person(notification.actor)}`,
                    reason(notification.reason)
                )
            ];
        case NotificationType.ShotExpired:
            return [
                post(
                    taskLogs,
                    Accent.Warning,
                    `**Claim expired:** ${shotLink(notification.shot, context)}`,
                    notification.claimant === null
                        ? "The task is open again."
                        : `${person(notification.claimant)} ran out of time. The task is open again.`
                )
            ];
        case NotificationType.SubmissionCreated:
            return [
                post(
                    taskLogs,
                    null,
                    `**Submitted:** ${shotLink(notification.shot, context)}, version ${notification.version}`,
                    `By ${person(notification.contributor)}`
                )
            ];
        case NotificationType.SubmissionReviewed: {
            const approved = notification.decision === ReviewDecision.Approved;
            const rendered = [
                post(
                    taskLogs,
                    approved ? Accent.Success : Accent.Warning,
                    `**${approved ? "Approved" : "Changes requested"}:** ${shotLink(notification.shot, context)}, version ${notification.version}`,
                    `Reviewed by ${person(notification.reviewer)}`,
                    notification.notes === null ? null : quote(notification.notes, 600)
                )
            ];
            if (approved) {
                rendered.push(
                    post(
                        ChannelPurpose.Announcements,
                        Accent.Success,
                        `**${shotName(notification.shot)} is finished.** Delivered by ${person(notification.contributor)}.`
                    )
                );
            }
            return rendered;
        }
    }
}
