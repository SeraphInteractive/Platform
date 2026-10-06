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
import { getAnnouncementEmbedUrl } from "@/Config/Announcement";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { useSession } from "@/Hooks/UseSession";

export function HomeView(): ReactNode {
    const { user } = useSession();
    const pipeline = useQuery({ queryKey: queryKeys.pipeline, queryFn: () => platformApi.pipeline() });
    const roundsQuery = { status: RoundStatus.Open, page: 1, perPage: 5 };
    const rounds = useQuery({ queryKey: queryKeys.rounds(roundsQuery), queryFn: () => platformApi.rounds(roundsQuery) });
    const shotsQuery = { status: ShotStatus.Available, page: 1, perPage: 1 };
    const shots = useQuery({ queryKey: queryKeys.shots(shotsQuery), queryFn: () => platformApi.shots(shotsQuery) });
    const myShots = useMyShots(user !== null ? user.id : null);
    const active = myShots.active;
    const videoUrl = getAnnouncementEmbedUrl();

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

            <section className="space-y-4">
                <h2 className="text-xl font-semibold tracking-tight">Community Workflows</h2>
                <div className="grid gap-6 md:grid-cols-3">
                    <Card className="flex flex-col justify-between transition-colors hover:border-foreground/40">
                        <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <Film className="size-5" />
                                </div>
                                <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">
                                    {shots.data?.meta.total ?? "–"} open
                                </span>
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">Task Grab-Box</h3>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    Claim production shots, download animatic briefs, and submit work-in-progress renders.
                                </p>
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
                            <div className="flex items-center justify-between">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <Vote className="size-5" />
                                </div>
                                <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">
                                    {rounds.data?.meta.total ?? "–"} active
                                </span>
                            </div>
                            <div className="space-y-1">
                                <h3 className="font-semibold text-base">Decision Ballots</h3>
                                <p className="text-muted-foreground text-xs leading-relaxed">
                                    Vote on story beats, character concepts, score direction, and film production proposals.
                                </p>
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
                            <div className="flex items-center justify-between">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <Layers className="size-5" />
                                </div>
                                <span className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-medium">
                                    {pipeline.data ? `${Math.round(pipeline.data.progressPercent)}%` : "–"}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-base">Production Roadmap</h3>
                                    <p className="text-muted-foreground text-xs leading-relaxed">
                                        {pipeline.data?.stepTitle ?? "Track live milestones and active departments."}
                                    </p>
                                </div>
                                {pipeline.data && (
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full bg-primary transition-all duration-300"
                                            style={{ width: `${Math.min(100, Math.max(0, pipeline.data.progressPercent))}%` }}
                                        />
                                    </div>
                                )}
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
