"use client";

import { RoundStatus, ShotStatus } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Film, Layers, Vote } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { VideoPlayer } from "@/Components/Common/VideoPlayer";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent } from "@/Components/Ui/card";
import { Progress } from "@/Components/Ui/progress";
import { getAnnouncementEmbedUrl } from "@/Config/Announcement";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { useSession } from "@/Hooks/UseSession";

export function HomeView(): ReactNode {
    const { user } = useSession();
    const myShots = useMyShots(user !== null ? user.id : null);
    const active = myShots.active;
    const videoUrl = getAnnouncementEmbedUrl();

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

    const rounds = roundsQuery.data?.data ?? [];
    const votingCount = rounds.filter((r) => r.status === RoundStatus.Voting).length;
    const openCount = rounds.filter((r) => r.status === RoundStatus.Open).length;
    const closedCount = rounds.filter((r) => r.status === RoundStatus.Finalized).length;

    const shots = shotsQuery.data?.data ?? [];
    const availableCount = shots.filter((s) => s.status === ShotStatus.Available).length;
    const inProgressCount = shots.filter((s) => s.status === ShotStatus.Claimed || s.status === ShotStatus.Submitted).length;

    return (
        <div className="mx-auto max-w-5xl space-y-10 pb-12">
            <header className="space-y-4">
                <div>
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        {user === null ? "Project Stairway" : `Welcome back, ${user.username}`}
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                        A community-made Minecraft animated film.
                    </p>
                </div>

                <VideoPlayer src={videoUrl} title="Project Stairway announcement trailer" />

                <blockquote className="border-border border-l-2 pl-4 text-xs italic text-muted-foreground sm:text-sm">
                    An independent community animation project bringing together 3D animators, modelers, storyboard artists,
                    and sound designers to build an original Minecraft cinematic narrative from the ground up.
                </blockquote>
            </header>

            {active !== null && (
                <Card className="border-foreground/40 bg-accent/20">
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">Your Active Task</span>
                            <p className="truncate font-semibold text-base sm:text-lg">
                                {active.shotCode} · {active.title}
                            </p>
                        </div>
                        <Button asChild size="sm">
                            <Link href={`/grabbox/${active.id}` as Route}>Open Workspace</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {progress && (
                <section className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                                Production Roadmap
                            </span>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-xs text-muted-foreground">
                                Phase {progress.phaseNumber}: {progress.phaseTitle}
                            </span>
                        </div>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            Step {progress.stepId} · {Math.round(progress.progressPercent)}%
                        </span>
                    </div>
                    <Progress value={progress.progressPercent} aria-label="Overall film production progress" />
                </section>
            )}

            <section className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Community Workflows</h2>
                <div className="grid gap-6 md:grid-cols-3">
                    <Card className="flex flex-col justify-between transition-colors hover:border-foreground/40">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between gap-2">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary w-fit">
                                    <Film className="size-5" />
                                </div>
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Production</span>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Task Grab-Box</h3>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <div className="rounded border bg-muted/40 px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">Available: </span>
                                        <span className="font-semibold tabular-nums">{availableCount}</span>
                                    </div>
                                    <div className="rounded border bg-muted/40 px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">In Progress: </span>
                                        <span className="font-semibold tabular-nums">{inProgressCount}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <div className="border-t p-4 pt-3">
                            <Button asChild variant="outline" size="sm" className="w-full justify-between">
                                <Link href="/grabbox">
                                    Browse Grab-Box <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </Card>

                    <Card className="flex flex-col justify-between transition-colors hover:border-foreground/40">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between gap-2">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary w-fit">
                                    <Vote className="size-5" />
                                </div>
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Governance</span>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Decision Ballots</h3>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <div className="rounded border bg-muted/40 px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">Voting: </span>
                                        <span className="font-semibold tabular-nums">{votingCount}</span>
                                    </div>
                                    <div className="rounded border bg-muted/40 px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">Submissions: </span>
                                        <span className="font-semibold tabular-nums">{openCount}</span>
                                    </div>
                                    <div className="rounded border bg-muted/40 px-2.5 py-1 text-xs">
                                        <span className="text-muted-foreground">Closed: </span>
                                        <span className="font-semibold tabular-nums">{closedCount}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <div className="border-t p-4 pt-3">
                            <Button asChild variant="outline" size="sm" className="w-full justify-between">
                                <Link href="/voting">
                                    Cast Your Vote <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </Card>

                    <Card className="flex flex-col justify-between transition-colors hover:border-foreground/40">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between gap-2">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary w-fit">
                                    <Layers className="size-5" />
                                </div>
                                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Milestones</span>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-semibold text-base">Production Roadmap</h3>
                                <div className="space-y-1.5 pt-1 text-xs">
                                    <div className="rounded border bg-muted/40 px-2.5 py-1">
                                        <span className="text-muted-foreground">Stage: </span>
                                        <span className="font-medium truncate">{progress?.phaseTitle ?? "Pre-Production"}</span>
                                    </div>
                                    <div className="rounded border bg-muted/40 px-2.5 py-1">
                                        <span className="text-muted-foreground">Step: </span>
                                        <span className="font-medium truncate">{progress ? `${progress.stepId} - ${progress.stepTitle}` : "Initial Setup"}</span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                        <div className="border-t p-4 pt-3">
                            <Button asChild variant="outline" size="sm" className="w-full justify-between">
                                <Link href="/roadmap">
                                    View Roadmap <ArrowRight className="size-4" />
                                </Link>
                            </Button>
                        </div>
                    </Card>
                </div>
            </section>
        </div>
    );
}
