import {
    EntryStatus,
    PollType,
    RaidFlag,
    RaidSeverity,
    RoundStatus,
    SeparationStatus,
    type EntryDto,
    type LeaderboardDto,
    type LeaderboardItemDto,
    type RaidTelemetryDto,
    type RoundDetailDto,
    type RoundDto,
    type RoundResultDto
} from "@platform/contracts";
import { ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { ActionRowBuilder, type MessageActionRowComponentBuilder } from "discord.js";
import {
    Accent,
    actionButton,
    buttons,
    divider,
    image,
    linkButton,
    message,
    panel,
    plain,
    pluralize,
    truncate,
    when,
    type V2Message
} from "../Discord/Ui.js";

export const roundSelectPrefix = "round-select";
export const entryPagePrefix = "entries";

export enum RoundView {
    Detail = "detail",
    Entries = "entries",
    Leaderboard = "leaderboard",
    Results = "results",
    Telemetry = "telemetry"
}

const statusLabels: Readonly<Record<RoundStatus, string>> = {
    [RoundStatus.Draft]: "Draft",
    [RoundStatus.Open]: "Open",
    [RoundStatus.Voting]: "Voting",
    [RoundStatus.Finalized]: "Finalized"
};

function pollLabel(pollType: PollType): string {
    return pollType === PollType.Binary ? "binary" : "ranked choice";
}

function schedule(round: RoundDto): string {
    if (round.status === RoundStatus.Voting && round.closesAt !== null) {
        return `closes ${when(round.closesAt)}`;
    }
    if (round.status === RoundStatus.Open && round.closesAt !== null) {
        return `submissions close ${when(round.closesAt)}`;
    }
    if (round.status === RoundStatus.Draft && round.opensAt !== null) {
        return `opens ${when(round.opensAt)}`;
    }
    return "";
}

export function sortRounds(rounds: readonly RoundDto[]): RoundDto[] {
    return [...rounds].sort((a, b) => {
        const aActive = a.status === RoundStatus.Voting || a.status === RoundStatus.Open;
        const bActive = b.status === RoundStatus.Voting || b.status === RoundStatus.Open;
        if (aActive !== bActive) {
            return aActive ? -1 : 1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function roundList(rounds: readonly RoundDto[]): V2Message {
    if (rounds.length === 0) {
        return message(panel(null, "No rounds yet."));
    }
    const shown = sortRounds(rounds).slice(0, 15);
    const lines = shown.map((round) => {
        const suffix = schedule(round);
        return `**${plain(round.title, 100)}**\n-# ${statusLabels[round.status]}, ${pollLabel(round.pollType)}${suffix.length > 0 ? `, ${suffix}` : ""}`;
    });
    const more = rounds.length > shown.length ? `\n-# and ${rounds.length - shown.length} more` : "";
    return message(panel(null, "## Rounds", divider(), lines.join("\n\n") + more));
}

export function roundSelect(action: RoundView, rounds: readonly RoundDto[], prompt: string): V2Message {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${roundSelectPrefix}:${action}`)
        .setPlaceholder("Choose a round")
        .addOptions(
            sortRounds(rounds)
                .slice(0, 25)
                .map((round) => ({
                    label: truncate(round.title, 90),
                    description: `${statusLabels[round.status]}, ${pollLabel(round.pollType)}`,
                    value: round.id
                }))
        );
    return message(panel(null, prompt, new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)));
}

export function roundDetail(round: RoundDetailDto, webAppUrl: string): V2Message {
    const times = [
        round.opensAt === null ? null : `Opens ${when(round.opensAt, "f")}`,
        round.closesAt === null ? null : `Closes ${when(round.closesAt, "f")}`
    ].filter((line): line is string => line !== null);
    const lines = [
        `## ${plain(round.title, 200)}`,
        `${statusLabels[round.status]}, ${pollLabel(round.pollType)}${round.isAcceptingVotes ? ", accepting votes" : ""}`,
        ...times,
        `${pluralize(round.eligibleEntryCount, "entry", "entries")}, ${pluralize(round.ballotCount, "ballot")}`,
        ...round.warnings.map((warning) => `-# ${plain(warning, 200)}`)
    ];
    const components = round.isAcceptingVotes ? [buttons(linkButton("Vote on the web", `${webAppUrl}/studio`))] : [];
    return message(panel(round.status === RoundStatus.Open ? Accent.Success : null, lines.join("\n"), ...components));
}

export function entryPage(round: RoundDetailDto, entries: readonly EntryDto[], index: number): V2Message {
    const entry = entries[index];
    if (entry === undefined) {
        return message(panel(null, `No entries in ${plain(round.title)} yet.`));
    }
    const status = entry.isQuarantined ? "quarantined" : entry.status === EntryStatus.Approved ? null : entry.status.replace(/_/gu, " ");
    const blocks = [
        `## ${plain(entry.title, 200)}`,
        entry.description === null ? "-# No description" : plain(entry.description, 1500),
        `-# ${plain(round.title, 100)}, entry ${index + 1} of ${entries.length}, submitted ${when(entry.createdAt)}${status === null ? "" : `, ${status}`}`
    ].join("\n");
    const media = entry.mediaUrl !== null && /\.(png|jpe?g|gif|webp)$/iu.test(entry.mediaUrl) ? [image(entry.mediaUrl, entry.title)] : [];
    const navigation = buttons(
        actionButton(`${entryPagePrefix}:${round.id}:${Math.max(0, index - 1)}`, "Previous", ButtonStyle.Secondary, index === 0),
        actionButton(
            `${entryPagePrefix}:${round.id}:${Math.min(entries.length - 1, index + 1)}`,
            "Next",
            ButtonStyle.Secondary,
            index >= entries.length - 1
        )
    );
    return message(panel(entry.isQuarantined ? Accent.Danger : null, blocks, ...media, navigation));
}

function standingLine(item: LeaderboardItemDto, pollType: PollType): string {
    if (pollType === PollType.Binary) {
        return `${item.position}. **${plain(item.title, 100)}** ${item.voteSharePercentage.toFixed(1)}%, ${pluralize(item.rawScore, "vote")}`;
    }
    const points = (item.regularizedTotalScore ?? item.rawScore).toFixed(1);
    const counts = item.rankCounts.map((count, position) => `${count}× ${["1st", "2nd", "3rd"][position] ?? ""}`).join(", ");
    return `${item.position}. **${plain(item.title, 100)}** ${points} pts\n-# ${counts}`;
}

export function leaderboard(round: RoundDto, board: LeaderboardDto): V2Message {
    if (board.items.length === 0) {
        return message(panel(null, `## ${plain(round.title)}`, "No votes yet."));
    }
    const lines = board.items.slice(0, 10).map((item) => standingLine(item, board.pollType));
    const footer = `-# ${pluralize(board.totalBallots, "ballot")}, updated ${when(board.computedAt)}${board.isConserved ? "" : ", point totals don't add up, check the audit"}`;
    return message(panel(null, `## ${plain(round.title)}`, lines.join("\n"), footer));
}

export function results(round: RoundDto, result: RoundResultDto): V2Message {
    const titles = new Map(result.leaderboard.map((item) => [item.entryId, item.title]));
    const standings = result.leaderboard.slice(0, 5).map((item) => standingLine(item, round.pollType));
    const lead = result.separations[0];
    const verdict =
        lead === undefined
            ? null
            : lead.status === SeparationStatus.DecisiveLead
              ? `-# The lead of ${plain(titles.get(lead.entryA) ?? "first place", 80)} is statistically clear (p = ${lead.pValue.toFixed(3)}).`
              : `-# First and second place are too close to call (p = ${lead.pValue.toFixed(3)}). A runoff is recommended.`;
    return message(
        panel(
            Accent.Info,
            [
                `## ${plain(round.title)}: results`,
                standings.join("\n"),
                verdict,
                `-# ${pluralize(result.totalBallots, "ballot")}, finalized ${when(result.finalizedAt, "D")}`
            ]
                .filter((line): line is string => line !== null)
                .join("\n")
        )
    );
}

const flagDescriptions: Readonly<Record<RaidFlag, string>> = {
    [RaidFlag.InsufficientSampleSize]: "too few votes to judge",
    [RaidFlag.UnnaturalRank1HyperSkew]: "almost only first-place votes",
    [RaidFlag.CollapsedRankEntropy]: "rankings barely vary",
    [RaidFlag.AnomalousVelocityBurst]: "sudden burst of votes"
};

export function telemetry(round: RoundDto, snapshots: readonly RaidTelemetryDto[], entries: readonly EntryDto[]): V2Message {
    if (snapshots.length === 0) {
        return message(panel(null, `## ${plain(round.title)}`, "No telemetry yet. It's recorded as votes come in."));
    }
    const titles = new Map(entries.map((entry) => [entry.id, entry.title]));
    const ordered = [...snapshots].sort((a, b) => b.compositeScore - a.compositeScore).slice(0, 15);
    const lines = ordered.map((snapshot) => {
        const flags = snapshot.flags.filter((flag) => flag !== RaidFlag.InsufficientSampleSize).map((flag) => flagDescriptions[flag]);
        const state =
            snapshot.severity === RaidSeverity.Normal
                ? "normal"
                : snapshot.severity === RaidSeverity.Suspicious
                  ? "suspicious"
                  : "critical";
        return `**${plain(titles.get(snapshot.entryId) ?? "Unknown entry", 100)}** ${state}\n-# ${flags.length > 0 ? flags.join(", ") : "no anomalies"}, velocity ${snapshot.velocityZScore.toFixed(1)}σ`;
    });
    const worst = ordered[0]?.severity ?? RaidSeverity.Normal;
    const accent = worst === RaidSeverity.CriticalRaid ? Accent.Danger : worst === RaidSeverity.Suspicious ? Accent.Warning : null;
    return message(panel(accent, `## ${plain(round.title)}: telemetry`, lines.join("\n")));
}
