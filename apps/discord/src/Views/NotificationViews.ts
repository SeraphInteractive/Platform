import {
    EntryStatus,
    NotificationType,
    PollType,
    RaidFlag,
    RoundStatus,
    roleLabel,
    specialtyLabel,
    type NotificationOf,
    type PlatformNotification
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
        case NotificationType.UserRoleChanged: {
            const role = roleLabel(notification.role);
            const specialties = notification.specialties.length > 0 ? ` (${notification.specialties.map(specialtyLabel).join(", ")})` : "";
            return [
                post(
                    telemetry,
                    Accent.Info,
                    "**User role updated**",
                    `${person(notification.user, isMember)} is now ${role}${specialties}, by ${person(notification.actor, isMember)}`
                )
            ];
        }
        case NotificationType.ContributorPromoted:
            return [post(telemetry, Accent.Success, `${person(notification.user, isMember)} is now a senior contributor.`)];
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
        case NotificationType.ShotUpdated:
        case NotificationType.ShotDeleted:
        case NotificationType.ShotClaimed:
        case NotificationType.ShotReleased:
        case NotificationType.ShotExpired:
        case NotificationType.SubmissionCreated:
        case NotificationType.SubmissionReviewed:
            return [];
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
                    telemetry,
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
        case NotificationType.TicketConfigUpdated:
        case NotificationType.TicketActivity:
        case NotificationType.FeedbackSurveyOpened:
        case NotificationType.FeedbackSurveyClosed:
        case NotificationType.FeedbackOutcomeRecorded:
            return [];
        case NotificationType.DocumentUpdated: {
            const noteText =
                notification.note !== null && notification.note.trim().length > 0 ? `\n-# Note: ${plain(notification.note, 200)}` : "";
            return [
                post(
                    ChannelPurpose.Telemetry,
                    Accent.Info,
                    `**${plain(notification.title)} Published (Rev #${notification.revision})**`,
                    `Published by ${person(notification.actor, isMember)}${noteText}`
                )
            ];
        }
        case NotificationType.AnnouncementPublished:
            // announcements are delivered directly via webhook in api
            return [];
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
        .replace(/<li>(.*?)<\/li>/gi, "• $1\n\n")
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
    const lines: string[] = [`# ${plain(notification.title)}`, `*Official community standards and pipeline etiquette.*`, ""];

    for (const section of notification.sections) {
        lines.push(`### ${section.title}`);
        lines.push("");
        lines.push(htmlToDiscordMarkdown(section.html));
        lines.push("");
    }

    lines.push(`-# Revision ${notification.revision} - Project Stairway Studio`);

    return message(panel(null, lines.join("\n").trim()));
}
