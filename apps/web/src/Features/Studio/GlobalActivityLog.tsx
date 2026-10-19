"use client";

import {
    NotificationType,
    ReviewDecision,
    activityEntrySchema,
    type ActivityEntryDto,
    type PlatformNotification
} from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Pause, Play, RefreshCw } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { cn } from "@/Lib/Utils";

type ActivityCategory = "all" | "tasks" | "rounds" | "users" | "security" | "system";

const categoryFilters: readonly { readonly id: ActivityCategory; readonly label: string }[] = [
    { id: "all", label: "All" },
    { id: "tasks", label: "Tasks" },
    { id: "rounds", label: "Voting" },
    { id: "users", label: "Users" },
    { id: "security", label: "Security" },
    { id: "system", label: "System" }
];

function categoryOf(type: NotificationType): ActivityCategory {
    switch (type) {
        case NotificationType.ShotCreated:
        case NotificationType.ShotUpdated:
        case NotificationType.ShotDeleted:
        case NotificationType.ShotClaimed:
        case NotificationType.ShotReleased:
        case NotificationType.ShotExpired:
        case NotificationType.SubmissionCreated:
        case NotificationType.SubmissionReviewed:
            return "tasks";

        case NotificationType.BallotSubmitted:
        case NotificationType.BallotBlocked:
        case NotificationType.RoundCreated:
        case NotificationType.RoundUpdated:
        case NotificationType.RoundDeleted:
        case NotificationType.RoundStatusChanged:
        case NotificationType.RoundFinalized:
        case NotificationType.EntrySubmitted:
        case NotificationType.EntryUpdated:
        case NotificationType.EntryDeleted:
        case NotificationType.EntryStatusChanged:
        case NotificationType.EntryReinstated:
            return "rounds";

        case NotificationType.UserBlacklisted:
        case NotificationType.UserReinstated:
        case NotificationType.UserRoleChanged:
        case NotificationType.ContributorPromoted:
            return "users";

        case NotificationType.RaidAlert:
        case NotificationType.MediaFlaggedAi:
            return "security";

        case NotificationType.PipelineUpdated:
        case NotificationType.DocumentUpdated:
            return "system";
    }
}

interface ActivityPresentation {
    readonly tag: string;
    readonly tone: Tone;
    readonly title: string;
    readonly detail: string | null;
    readonly href?: Route;
}

function describeNotification(notification: PlatformNotification): ActivityPresentation {
    switch (notification.type) {
        case NotificationType.ShotCreated:
            return {
                tag: "Task",
                tone: Tone.Info,
                title: `Task created: ${notification.shot.code}`,
                detail: notification.shot.title,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.ShotClaimed:
            return {
                tag: "Claim",
                tone: Tone.Positive,
                title: `${notification.claimant.username} claimed ${notification.shot.code}`,
                detail: notification.shot.title,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.ShotReleased:
            return {
                tag: "Release",
                tone: Tone.Warning,
                title: `${notification.actor.username} released ${notification.shot.code}`,
                detail: notification.reason ?? notification.shot.title,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.ShotExpired:
            return {
                tag: "Expired",
                tone: Tone.Negative,
                title: `Claim expired on ${notification.shot.code}`,
                detail: notification.claimant?.username ? `Held by ${notification.claimant.username}` : null,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.SubmissionCreated:
            return {
                tag: "Submission",
                tone: Tone.Info,
                title: `${notification.contributor.username} submitted v${String(notification.version)} for ${notification.shot.code}`,
                detail: notification.notes ?? notification.shot.title,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.SubmissionReviewed:
            return {
                tag: "Review",
                tone: notification.decision === ReviewDecision.Approved ? Tone.Positive : Tone.Negative,
                title: `${notification.reviewer.username} reviewed v${String(notification.version)} for ${notification.shot.code}`,
                detail: `Decision: ${notification.decision}${notification.notes ? ` - ${notification.notes}` : ""}`,
                href: `/grabbox/${notification.shot.code}` as Route
            };

        case NotificationType.BallotSubmitted:
            return {
                tag: "Ballot",
                tone: Tone.Positive,
                title: `${notification.voter.username} voted in round`,
                detail: notification.round.title,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.BallotBlocked:
            return {
                tag: "Blocked",
                tone: Tone.Warning,
                title: `Ballot blocked for ${notification.voter.username}`,
                detail: `${notification.round.title}${notification.reason ? ` - ${notification.reason}` : ""}`,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.RoundCreated:
            return {
                tag: "Round",
                tone: Tone.Info,
                title: `${notification.actor.username} created round`,
                detail: notification.round.title,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.RoundStatusChanged:
            return {
                tag: "Round",
                tone: Tone.Neutral,
                title: `Round status changed: ${notification.from} -> ${notification.to}`,
                detail: notification.round.title,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.RoundFinalized:
            return {
                tag: "Finalized",
                tone: Tone.Neutral,
                title: `Round finalized (${String(notification.totalBallots)} ballots)`,
                detail: notification.round.title,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.EntrySubmitted:
            return {
                tag: "Entry",
                tone: Tone.Info,
                title: `${notification.author.username} submitted entry`,
                detail: `"${notification.entry.title}" in ${notification.round.title}`,
                href: `/studio/rounds/${notification.round.id}` as Route
            };

        case NotificationType.RaidAlert:
            return {
                tag: "Raid",
                tone: Tone.Negative,
                title: `${notification.severity} raid alert: Z=${notification.velocityZScore.toFixed(2)}`,
                detail: `Round: ${notification.round.title} (flags: ${notification.flags.join(", ")})`,
                href: `/studio/telemetry?roundId=${notification.round.id}` as Route
            };

        case NotificationType.MediaFlaggedAi:
            return {
                tag: "AI Flag",
                tone: Tone.Negative,
                title: `${notification.mediaKind} "${notification.title}" flagged`,
                detail: `Author: ${notification.author.username} - Flags: ${notification.flags.join(", ")}`
            };

        case NotificationType.UserRoleChanged:
            return {
                tag: "Role",
                tone: Tone.Warning,
                title: `${notification.actor.username} updated ${notification.user.username}`,
                detail: `Assigned role: ${notification.role}`,
                href: "/studio/people" as Route
            };

        case NotificationType.UserBlacklisted:
            return {
                tag: "Blacklist",
                tone: Tone.Negative,
                title: `${notification.actor.username} blacklisted ${notification.user.username}`,
                detail: notification.reason,
                href: "/studio/people" as Route
            };

        case NotificationType.UserReinstated:
            return {
                tag: "Reinstated",
                tone: Tone.Positive,
                title: `${notification.actor.username} reinstated ${notification.user.username}`,
                detail: null,
                href: "/studio/people" as Route
            };

        case NotificationType.ContributorPromoted:
            return {
                tag: "Promoted",
                tone: Tone.Positive,
                title: `${notification.actor.username} promoted ${notification.user.username}`,
                detail: "Granted Contributor standing",
                href: "/studio/people" as Route
            };

        case NotificationType.PipelineUpdated:
            return {
                tag: "Pipeline",
                tone: Tone.Info,
                title: `Pipeline: ${notification.phaseTitle} - ${notification.stepTitle}`,
                detail: `Progress at ${String(notification.progressPercent)}%`
            };

        case NotificationType.DocumentUpdated:
            return {
                tag: "Document",
                tone: Tone.Neutral,
                title: `${notification.actor.username} updated ${notification.title}`,
                detail: `Revision ${String(notification.revision)}${notification.note ? ` - ${notification.note}` : ""}`,
                href: "/guidelines" as Route
            };

        default:
            return {
                tag: "Event",
                tone: Tone.Neutral,
                title: (notification as { readonly type: string }).type,
                detail: null
            };
    }
}

export function GlobalActivityLog(): ReactNode {
    const [category, setCategory] = useState<ActivityCategory>("all");
    const [isStreaming, setIsStreaming] = useState(true);
    const [streamConnected, setStreamConnected] = useState(false);
    const [liveEntries, setLiveEntries] = useState<readonly ActivityEntryDto[]>([]);

    const initial = useQuery({
        queryKey: queryKeys.activity(100),
        queryFn: () => platformApi.activity(100),
        staleTime: 60_000
    });

    useEffect(() => {
        if (!isStreaming) {
            setStreamConnected(false);
            return;
        }

        const source = new EventSource("/api/v1/telemetry/activity/stream");

        source.onopen = (): void => {
            setStreamConnected(true);
        };

        source.onerror = (): void => {
            setStreamConnected(false);
        };

        const handleActivity = (message: MessageEvent<string>): void => {
            try {
                const parsed = activityEntrySchema.safeParse(JSON.parse(message.data));
                if (parsed.success) {
                    setLiveEntries((current) => {
                        if (current.some((entry) => entry.id === parsed.data.id)) {
                            return current;
                        }
                        return [parsed.data, ...current].slice(0, 100);
                    });
                }
            } catch {
                // ignore malformed payloads
            }
        };

        source.addEventListener("activity", handleActivity);

        return () => {
            source.removeEventListener("activity", handleActivity);
            source.close();
            setStreamConnected(false);
        };
    }, [isStreaming]);

    const combinedEntries = useMemo(() => {
        const base = initial.data ?? [];
        const seen = new Set<string>();
        const merged: ActivityEntryDto[] = [];

        for (const entry of liveEntries) {
            if (!seen.has(entry.id)) {
                seen.add(entry.id);
                merged.push(entry);
            }
        }
        for (const entry of base) {
            if (!seen.has(entry.id)) {
                seen.add(entry.id);
                merged.push(entry);
            }
        }
        return merged;
    }, [initial.data, liveEntries]);

    const filtered = useMemo(() => {
        if (category === "all") {
            return combinedEntries;
        }
        return combinedEntries.filter((item) => categoryOf(item.notification.type) === category);
    }, [combinedEntries, category]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-base font-semibold">Global Activity & Telemetry</h2>
                    <p className="text-muted-foreground text-xs">Real-time audit log across tasks, voting, roles, and safety telemetry.</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-xs">
                        <span
                            className={cn(
                                "size-2 rounded-full transition-colors",
                                streamConnected ? "bg-emerald-500 animate-pulse" : isStreaming ? "bg-amber-500" : "bg-muted-foreground/40"
                            )}
                        />
                        <span className="text-muted-foreground font-mono text-[11px]">
                            {streamConnected ? "Live" : isStreaming ? "Connecting" : "Paused"}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setIsStreaming((prev) => !prev)}
                        className="gap-1 text-xs"
                    >
                        {isStreaming ? <Pause className="size-3" /> : <Play className="size-3" />}
                        <span>{isStreaming ? "Pause" : "Resume"}</span>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => void initial.refetch()}
                        disabled={initial.isFetching}
                        title="Refresh"
                    >
                        <RefreshCw className={cn("size-3", initial.isFetching && "animate-spin")} />
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-1 border-b pb-2">
                {categoryFilters.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCategory(tab.id)}
                        className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            category === tab.id
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {initial.isPending && combinedEntries.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground font-mono">
                    Loading activity feed...
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
                    No activity entries found for this category.
                </div>
            ) : (
                <div className="divide-y rounded-md border bg-card max-h-[460px] overflow-y-auto">
                    {filtered.map((entry) => {
                        const presentation = describeNotification(entry.notification);
                        return (
                            <div
                                key={entry.id}
                                className="flex items-start justify-between gap-4 p-3 text-xs transition-colors hover:bg-muted/40"
                            >
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <ToneBadge tone={presentation.tone}>{presentation.tag}</ToneBadge>
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-medium text-foreground">{presentation.title}</span>
                                            {presentation.href && (
                                                <Link
                                                    href={presentation.href}
                                                    className="inline-flex items-center text-primary hover:underline"
                                                    title="View target"
                                                >
                                                    <ArrowUpRight className="size-3" />
                                                </Link>
                                            )}
                                        </div>
                                        {presentation.detail && (
                                            <p className="text-muted-foreground truncate max-w-xl">{presentation.detail}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="shrink-0 text-muted-foreground font-mono text-[11px] text-right">
                                    <RelativeTime value={entry.notification.occurredAt} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
