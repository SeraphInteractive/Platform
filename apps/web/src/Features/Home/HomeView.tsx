"use client";

import { RoundStatus, ShotStatus } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Film, Vote } from "lucide-react";
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
                    An independent community animation project bringing together artists to build an original Minecraft
                    cinematic narrative from the ground up.
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
                            <Link href="/roadmap" className="text-muted-foreground hover:text-foreground text-xs font-semibold uppercase tracking-wider transition-colors">
                                Production Roadmap
                            </Link>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-xs text-muted-foreground">
                                {progress.phaseTitle}
                            </span>
                        </div>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            Step {progress.stepId}: {progress.stepTitle} · {Math.round(progress.progressPercent)}%
                        </span>
                    </div>
                    <Progress value={progress.progressPercent} aria-label="Overall film production progress" />
                </section>
            )}

            <section className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Community Workflows</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Link
                        href="/grabbox"
                        className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-foreground/40 hover:bg-accent/10"
                    >
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Film className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">Grab-Box</h3>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    <span className="font-medium text-foreground tabular-nums">{availableCount}</span> available to claim · <span className="font-medium text-foreground tabular-nums">{inProgressCount}</span> in progress
                                </p>
                            </div>
                        </div>
                    </Link>

                    <Link
                        href="/voting"
                        className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 transition-all hover:border-foreground/40 hover:bg-accent/10"
                    >
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Vote className="size-5 text-muted-foreground transition-colors group-hover:text-foreground" />
                                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">Ballots</h3>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    <span className="font-medium text-foreground tabular-nums">{votingCount}</span> voting · <span className="font-medium text-foreground tabular-nums">{openCount}</span> submissions · <span className="font-medium text-foreground tabular-nums">{closedCount}</span> closed
                                </p>
                            </div>
                        </div>
                    </Link>
                </div>
            </section>
        </div>
    );
}
