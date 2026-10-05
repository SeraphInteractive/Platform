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
import type { MediaGalleryBuilder } from "discord.js";
import { ChannelPurpose } from "../State/SettingsStore.js";
import { Accent, image, message, panel, person, plain, quote, when, type V2Message } from "../Discord/Ui.js";

export interface RenderedNotification {
    readonly purpose: ChannelPurpose;
    readonly message: V2Message;
}

export interface NotificationContext {
    readonly threadFor: (shotId: string) => string | undefined;
    readonly isMember?: (discordId: string) => boolean;
}

type Line = string | MediaGalleryBuilder | null;

// consecutive text lines share one text display; media galleries sit between them
function post(purpose: ChannelPurpose, accent: Accent | null, ...lines: readonly Line[]): RenderedNotification {
    const blocks: (string | MediaGalleryBuilder)[] = [];
    for (const line of lines) {
        const previous = blocks.at(-1);
        if (line === null) {
            continue;
        }
        if (typeof line === "string" && typeof previous === "string") {
            blocks[blocks.length - 1] = `${previous}
${line}`;
        } else {
            blocks.push(line);
        }
    }
    return { purpose, message: message(panel(accent, ...blocks)) };
}

function preview(url: string | null | undefined, title: string): MediaGalleryBuilder | null {
    return url === null || url === undefined || !/\.(png|jpe?g|gif|webp|mp4|webm|mov)$/iu.test(url) ? null : image(url, title);
}

function reason(value: string | null): string | null {
    return value === null || value.trim().length === 0 ? null : `-# Reason: ${plain(value, 300)}`;
}

function shotName(shot: ShotReference): string {
    return `${plain(shot.code, 50)} - ${plain(shot.title, 120)}`;
}

function shotLink(shot: ShotReference, context: NotificationContext): string {
    const thread = context.threadFor(shot.id);
    return thread === undefined ? shotName(shot) : `${shotName(shot)} (<#${thread}>)`;
}

function describeBallot(notification: NotificationOf<NotificationType.BallotSubmitted>, context: NotificationContext): string {
    const action = notification.isChange ? "updated their ballot." : "cast a ballot.";
    return `${person(notification.voter, context.isMember)} ${action}`;
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
    [RoundStatus.Draft]: "moved to draft",
    [RoundStatus.Open]: "is open for submissions",
    [RoundStatus.Voting]: "is open for voting",
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
    const isMember = context.isMember;
    switch (notification.type) {
        case NotificationType.BallotSubmitted:
            return [post(telemetry, null, `**Vote in ${plain(notification.round.title)}**`, describeBallot(notification, context))];
        case NotificationType.BallotBlocked:
            return [
                post(
                    telemetry,
                    Accent.Danger,
                    `**Blocked vote in ${plain(notification.round.title)}**`,
                    `${person(notification.voter, isMember)} is banned from voting.`,
                    reason(notification.reason)
                )
            ];
        case NotificationType.UserBlacklisted:
            return [
                post(
                    telemetry,
                    Accent.Danger,
                    "**Banned from voting**",
                    `${person(notification.user, isMember)}, by ${person(notification.actor, isMember)}`,
                    reason(notification.reason)
                )
            ];
        case NotificationType.UserReinstated:
            return [
                post(
                    telemetry,
                    Accent.Success,
                    "**Voting ban lifted**",
                    `${person(notification.user, isMember)}, by ${person(notification.actor, isMember)}`
                )
            ];
        case NotificationType.UserRoleChanged:
            return [
                post(
                    telemetry,
                    Accent.Info,
                    "**User role updated**",
                    `${person(notification.user, isMember)} is now ${notification.role}${notification.specialties.length > 0 ? ` (${notification.specialties.join(", ")})` : ""}, by ${person(notification.actor, isMember)}`
                )
            ];
        case NotificationType.ContributorPromoted:
            return [
                post(ChannelPurpose.Announcements, Accent.Success, `${person(notification.user, isMember)} is now a senior contributor.`)
            ];
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
                    `-# Created by ${person(notification.actor, isMember)}`
                )
            ];
        case NotificationType.RoundUpdated:
            return [
                post(
                    telemetry,
                    Accent.Info,
                    `**Round updated: ${plain(notification.round.title)}**`,
                    `${notification.round.pollType === PollType.Binary ? "Binary" : "Ranked choice"}, ${describeSchedule(notification.opensAt, notification.closesAt)}`,
                    `-# Updated by ${person(notification.actor, isMember)}`
                )
            ];
        case NotificationType.RoundDeleted:
            return [
                post(
                    telemetry,
                    Accent.Warning,
                    `**Round deleted: ${plain(notification.round.title)}**`,
                    `-# Deleted by ${person(notification.actor, isMember)}`
                )
            ];
        case NotificationType.RoundStatusChanged: {
            const posts: RenderedNotification[] = [
                post(
                    telemetry,
                    notification.to === RoundStatus.Voting || notification.to === RoundStatus.Open ? Accent.Success : null,
                    `**${plain(notification.round.title)} ${statusVerbs[notification.to]}**`,
                    `-# By ${person(notification.actor, isMember)}`
                )
            ];
            if (notification.to === RoundStatus.Voting) {
                posts.push(
                    post(
                        ChannelPurpose.Announcements,
                        Accent.Success,
                        `## Voting is now open for ${plain(notification.round.title)}!`,
                        `Cast your vote on the platform: ${notification.round.pollType === PollType.Binary ? "Binary vote" : "Ranked choice vote"}.`,
                        `-# Opened by ${person(notification.actor, isMember)}`
                    )
                );
            } else if (notification.to === RoundStatus.Open) {
                posts.push(
                    post(
                        ChannelPurpose.Announcements,
                        Accent.Success,
                        `## Submissions are now open for ${plain(notification.round.title)}!`,
                        `Submit your entries on the platform before voting begins.`,
                        `-# Opened by ${person(notification.actor, isMember)}`
                    )
                );
            }
            return posts;
        }
        case NotificationType.RoundFinalized:
            return [
                post(
                    ChannelPurpose.Announcements,
                    Accent.Info,
                    `## ${plain(notification.round.title)}`,
                    describeWinner(notification),
                    `-# ${notification.totalBallots.toLocaleString("en-US")} ${notification.totalBallots === 1 ? "ballot" : "ballots"} counted`,
                    preview(notification.winner?.mediaUrl, notification.winner?.title ?? notification.round.title)
                )
            ];
        case NotificationType.EntrySubmitted:
            return [
                post(
                    telemetry,
                    null,
                    `**New entry in ${plain(notification.round.title)}**`,
                    `${plain(notification.entry.title)} by ${person(notification.author, isMember)}`,
                    notification.status === EntryStatus.PendingReview ? "-# Waiting for review" : "-# Approved automatically",
                    preview(notification.entry.mediaUrl, notification.entry.title)
                )
            ];
        case NotificationType.EntryUpdated:
            return [
                post(
                    telemetry,
                    Accent.Info,
                    `**Entry updated in ${plain(notification.round.title)}**`,
                    plain(notification.entry.title),
                    `-# Updated by ${person(notification.actor, isMember)}`,
                    preview(notification.entry.mediaUrl, notification.entry.title)
                )
            ];
        case NotificationType.EntryDeleted:
            return [
                post(
                    telemetry,
                    Accent.Warning,
                    `**Entry deleted in ${plain(notification.round.title)}**`,
                    plain(notification.entry.title),
                    `-# Deleted by ${person(notification.actor, isMember)}`
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
                    `-# By ${person(notification.actor, isMember)}`,
                    preview(notification.entry.mediaUrl, notification.entry.title)
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
                    `-# By ${person(notification.actor, isMember)}`,
                    preview(notification.entry.mediaUrl, notification.entry.title)
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
                    `${person(notification.claimant, isMember)}, due ${when(notification.deadlineAt)}`
                )
            ];
        case NotificationType.ShotReleased:
            return [
                post(
                    taskLogs,
                    null,
                    `**Released:** ${shotLink(notification.shot, context)}`,
                    `By ${person(notification.actor, isMember)}`,
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
                        : `${person(notification.claimant, isMember)} ran out of time. The task is open again.`
                )
            ];
        case NotificationType.SubmissionCreated:
            return [
                post(
                    taskLogs,
                    null,
                    `**Submitted:** ${shotLink(notification.shot, context)}, version ${notification.version}`,
                    `By ${person(notification.contributor, isMember)}`,
                    notification.notes === null ? null : quote(notification.notes, 500)
                )
            ];
        case NotificationType.SubmissionReviewed: {
            const approved = notification.decision === ReviewDecision.Approved;
            const rendered = [
                post(
                    taskLogs,
                    approved ? Accent.Success : Accent.Warning,
                    `**${approved ? "Approved" : "Changes requested"}:** ${shotLink(notification.shot, context)}, version ${notification.version}`,
                    `Reviewed by ${person(notification.reviewer, isMember)}`,
                    notification.notes === null ? null : quote(notification.notes, 600)
                )
            ];
            if (approved) {
                rendered.push(
                    post(
                        ChannelPurpose.Announcements,
                        Accent.Success,
                        `**${shotName(notification.shot)} is finished.** Delivered by ${person(notification.contributor, isMember)}.`
                    )
                );
            }
            return rendered;
        }
        case NotificationType.PipelineUpdated: {
            if (notification.isPhaseTransition) {
                return [
                    post(
                        ChannelPurpose.Announcements,
                        Accent.Success,
                        `## Phase ${notification.phaseNumber} Unlocked: ${plain(notification.phaseTitle)}`,
                        `Now entering **Step ${plain(notification.stepId)}: ${plain(notification.stepTitle)}** (${notification.progressPercent}% overall completed).`,
                        `-# Updated by ${person(notification.actor, isMember)}`
                    )
                ];
            }
            return [
                post(
                    ChannelPurpose.Announcements,
                    Accent.Info,
                    `**Pipeline Update: Step ${plain(notification.stepId)} - ${plain(notification.stepTitle)}**`,
                    `In **${plain(notification.phaseTitle)}** (${notification.progressPercent}% completed).`,
                    `-# Updated by ${person(notification.actor, isMember)}`
                )
            ];
        }
        case NotificationType.MediaFlaggedAi: {
            const kindLabel = notification.mediaKind === "entry" ? "Round Entry" : "Task Deliverable";
            const flagLines = notification.flags.map((flag) => `• ${plain(flag, 120)}`).join("\n");
            return [
                post(
                    ChannelPurpose.Telemetry,
                    Accent.Warning,
                    `**AI signatures detected:** ${kindLabel} "${plain(notification.title, 80)}"`,
                    `Uploaded by ${person(notification.author, isMember)}`,
                    flagLines,
                    notification.snippet === null ? null : quote(notification.snippet, 300)
                )
            ];
        }
        case NotificationType.DocumentUpdated: {
            const noteText =
                notification.note !== null && notification.note.trim().length > 0 ? `\n-# Note: ${plain(notification.note, 200)}` : "";
            return [
                post(
                    ChannelPurpose.TaskLogs,
                    Accent.Info,
                    `**Guidelines Updated (Rev #${notification.revision}): ${plain(notification.title)}**`,
                    `Updated by ${person(notification.actor, isMember)}${noteText}`
                ),
                post(
                    ChannelPurpose.Telemetry,
                    Accent.Info,
                    `**Document Published: ${plain(notification.title)} (Rev #${notification.revision})**`,
                    `Published by ${person(notification.actor, isMember)}${noteText}`
                )
            ];
        }
    }
}

export function htmlToDiscordMarkdown(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p>/gi, "\n\n")
        .replace(/<\/?p>/gi, "")
        .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
        .replace(/<b>(.*?)<\/b>/gi, "**$1**")
        .replace(/<em>(.*?)<\/em>/gi, "*$1*")
        .replace(/<i>(.*?)<\/i>/gi, "*$1*")
        .replace(/<code>(.*?)<\/code>/gi, "`$1`")
        .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```")
        .replace(/<li>(.*?)<\/li>/gi, "• $1\n")
        .replace(/<\/?ul>/gi, "\n")
        .replace(/<\/?ol>/gi, "\n")
        .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
        .replace(/&gt;/gi, ">")
        .replace(/&lt;/gi, "<")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function renderRulesMessage(notification: NotificationOf<NotificationType.DocumentUpdated>): V2Message {
    const lines: string[] = [`# 📜 ${notification.title}`, `*Official guidelines, scoring invariants, and fair-play policies.*`, ""];

    for (const section of notification.sections) {
        lines.push(`### ${section.title}`);
        lines.push(htmlToDiscordMarkdown(section.html));
        lines.push("");
    }

    lines.push(
        `-# Revision ${notification.revision} • Synced automatically from web platform • [View Full Documentation](https://dev-api.seraphinteractive.com/documentation)`
    );

    return message(panel(Accent.Info, lines.join("\n").trim()));
}
