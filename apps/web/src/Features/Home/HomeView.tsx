"use client";

import { RoundStatus, ShotStatus } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight, Film, Map as MapIcon, Vote, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { StatTile } from "@/Components/Common/StatTile";
import { Badge } from "@/Components/Ui/badge";
import { Button } from "@/Components/Ui/button";
import { Card } from "@/Components/Ui/card";
import { Progress } from "@/Components/Ui/progress";
import { Skeleton } from "@/Components/Ui/skeleton";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { useSession } from "@/Hooks/UseSession";
import { cn } from "@/Lib/Utils";

const PLACEHOLDER = "–";

interface PanelProps {
    readonly title: string;
    readonly icon: LucideIcon;
    readonly action?: ReactNode;
    readonly className?: string;
    readonly children: ReactNode;
}

// bordered card with a header strip, used for every block on the overview
function Panel({ title, icon: Icon, action, className, children }: PanelProps): ReactNode {
    return (
        <Card className={cn("gap-0 py-0 shadow-xs", className)}>
            <div className="flex h-11 items-center justify-between gap-2 border-b px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <h2 className="truncate text-sm font-semibold">{title}</h2>
                </div>
                {action}
            </div>
            {children}
        </Card>
    );
}

interface Metric {
    readonly label: string;
    readonly value: number | null;
}

interface WorkflowPanelProps {
    readonly title: string;
    readonly icon: LucideIcon;
    readonly href: Route;
    readonly cta: string;
    readonly description: string;
    readonly metrics: readonly Metric[];
    readonly emptyMessage: string;
}

function WorkflowPanel({ title, icon, href, cta, description, metrics, emptyMessage }: WorkflowPanelProps): ReactNode {
    const loaded = metrics.every((metric) => metric.value !== null);
    const isEmpty = loaded && metrics.every((metric) => metric.value === 0);
    return (
        <Panel title={title} icon={icon} className="h-full">
            <div className="flex flex-1 flex-col gap-4 p-4">
                <p className="text-muted-foreground text-[13px] leading-relaxed text-pretty">{description}</p>
                <dl className={cn("grid divide-x rounded-md border", metrics.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                    {metrics.map((metric) => (
                        <div key={metric.label} className="min-w-0 px-3 py-2.5">
                            <dt className="text-muted-foreground truncate text-xs">{metric.label}</dt>
                            <dd className={cn("text-lg font-semibold tabular-nums", metric.value === 0 && "text-muted-foreground")}>
                                {metric.value ?? PLACEHOLDER}
                            </dd>
                        </div>
                    ))}
                </dl>
                {isEmpty && <p className="text-muted-foreground text-xs">{emptyMessage}</p>}
            </div>
            <div className="mt-auto border-t px-4 py-2.5">
                <Link
                    href={href}
                    className="text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm text-[13px] font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                    {cta}
                    <ArrowRight className="size-3.5" aria-hidden />
                </Link>
            </div>
        </Panel>
    );
}

export function HomeView(): ReactNode {
    const { user } = useSession();
    const myShots = useMyShots(user !== null ? user.id : null);
    const active = myShots.active;

    // fetch live production statistics and workflow states
    const pipelineQuery = useQuery({
        queryKey: queryKeys.pipeline,
        queryFn: () => platformApi.pipeline()
    });

    const roundsQuery = useQuery({
        queryKey: queryKeys.roundsAll,
        queryFn: () => platformApi.rounds({ perPage: 100 })
    });

    const shotsQuery = useQuery({
        queryKey: queryKeys.shotsAll,
        queryFn: () => platformApi.shots({ perPage: 100 })
    });

    const progress = pipelineQuery.data;
    const progressPercent = progress === undefined ? null : Math.round(progress.progressPercent);

    const rounds = roundsQuery.data?.data;
    const countRounds = (status: RoundStatus): number | null =>
        rounds === undefined ? null : rounds.filter((r) => r.status === status).length;
    const votingCount = countRounds(RoundStatus.Voting);
    const openCount = countRounds(RoundStatus.Open);
    const closedCount = countRounds(RoundStatus.Finalized);

    const shots = shotsQuery.data?.data;
    const availableCount = shots === undefined ? null : shots.filter((s) => s.status === ShotStatus.Available).length;
    const inProgressCount =
        shots === undefined ? null : shots.filter((s) => s.status === ShotStatus.Claimed || s.status === ShotStatus.Submitted).length;

    return (
        <div className="mx-auto max-w-6xl space-y-6 pb-12">
            <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 space-y-1">
                    <h1 className="truncate text-2xl font-semibold tracking-tight">
                        {user === null ? "Project Stairway" : `Welcome back, ${user.username}`}
                    </h1>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button asChild variant="outline" size="sm">
                        <Link href="/roadmap">
                            <MapIcon aria-hidden />
                            Roadmap
                        </Link>
                    </Button>
                    <Button asChild size="sm">
                        <Link href="/grabbox">
                            <Film aria-hidden />
                            Browse tasks
                        </Link>
                    </Button>
                </div>
            </header>

            {active !== null && (
                <div className="bg-card border-l-primary flex flex-col gap-3 rounded-md border border-l-4 px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-muted-foreground text-xs font-medium">Your active task</p>
                        <p className="truncate text-sm font-semibold">
                            <span className="font-mono">{active.shotCode}</span> · {active.title}
                        </p>
                    </div>
                    <Button asChild size="sm" className="self-start sm:self-auto">
                        <Link href={`/grabbox/${active.id}` as Route}>
                            Open workspace
                            <ChevronRight aria-hidden />
                        </Link>
                    </Button>
                </div>
            )}

            <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                    label="Available to claim"
                    value={availableCount ?? PLACEHOLDER}
                    hint={availableCount === 0 ? "None right now" : "Open in the grab-box"}
                    href="/grabbox"
                    emphasis={(availableCount ?? 0) > 0}
                />
                <StatTile
                    label="In progress"
                    value={inProgressCount ?? PLACEHOLDER}
                    hint={inProgressCount === 0 ? "No active claims" : "Claimed or in review"}
                    href="/grabbox"
                />
                <StatTile
                    label="Ballots voting"
                    value={votingCount ?? PLACEHOLDER}
                    hint={votingCount === 0 ? "No votes open" : "Cast your vote"}
                    href="/voting"
                    emphasis={(votingCount ?? 0) > 0}
                />
                <StatTile
                    label="Film progress"
                    value={progressPercent === null ? PLACEHOLDER : `${progressPercent}%`}
                    hint={progress?.phaseTitle ?? "Production roadmap"}
                    href="/roadmap"
                />
            </section>

            <div className="space-y-6">
                <Panel
                    title="Production roadmap"
                    icon={MapIcon}
                    action={
                        <Button asChild variant="ghost" size="xs">
                            <Link href="/roadmap">
                                View roadmap
                                <ChevronRight aria-hidden />
                            </Link>
                        </Button>
                    }
                >
                    <div className="space-y-3 p-4">
                        {pipelineQuery.isPending ? (
                            <div className="space-y-2" aria-busy="true" aria-label="Loading">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-2 w-full" />
                            </div>
                        ) : progress === undefined ? (
                            <p className="text-muted-foreground text-[13px]">Roadmap progress is unavailable right now.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                                    <div className="min-w-0">
                                        <p className="text-muted-foreground text-xs">{progress.phaseTitle}</p>
                                        <p className="text-sm font-semibold">
                                            Step {progress.stepId}: {progress.stepTitle}
                                        </p>
                                    </div>
                                    <span className="text-2xl font-semibold tabular-nums">{progressPercent}%</span>
                                </div>
                                <Progress value={progress.progressPercent} aria-label="Overall film production progress" />
                                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                                    {progress.isPhaseTransition ? (
                                        <Badge variant="outline">Phase transition</Badge>
                                    ) : (
                                        <span>Overall film production</span>
                                    )}
                                    {progress.updatedAt !== null && <RelativeTime value={progress.updatedAt} prefix="Updated" />}
                                </div>
                            </>
                        )}
                    </div>
                </Panel>

                <section aria-labelledby="workflows-heading" className="space-y-2.5">
                    <h2 id="workflows-heading" className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        Community workflows
                    </h2>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <WorkflowPanel
                            title="Grab-Box"
                            icon={Film}
                            href="/grabbox"
                            cta="Open Grab-Box"
                            description="Claim animation shots that match your specialty and submit your work for review."
                            metrics={[
                                { label: "Available", value: availableCount },
                                { label: "In progress", value: inProgressCount }
                            ]}
                            emptyMessage="No shots are open yet. New tasks appear here as they're published."
                        />
                        <WorkflowPanel
                            title="Ballots"
                            icon={Vote}
                            href="/voting"
                            cta="Open Ballots"
                            description="Submit entries to open rounds and vote on the community's favourites."
                            metrics={[
                                { label: "Voting", value: votingCount },
                                { label: "Submissions", value: openCount },
                                { label: "Closed", value: closedCount }
                            ]}
                            emptyMessage="No rounds have started yet. Check back when the next round opens."
                        />
                    </div>
                </section>
            </div>
        </div>
    );
}
