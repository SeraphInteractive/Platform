"use client";

import { RoundStatus, ShotStatus, type RoundDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { StatTile } from "@/Components/Common/StatTile";
import { ErrorState, LoadingRows } from "@/Components/Common/States";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent } from "@/Components/Ui/card";
import { useMyShots } from "@/Features/Grabbox/UseMyShots";
import { PipelineSummary } from "@/Features/Roadmap/RoadmapView";
import { useSession } from "@/Hooks/UseSession";
import { pollTypeLabels } from "@/Lib/Format";

function RoundRow({ round }: { readonly round: RoundDto }): ReactNode {
    return (
        <li>
            <Link href={`/voting/${round.id}` as Route} className="hover:bg-accent/50 flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                    <span className="block truncate text-sm">{round.title}</span>
                    <span className="text-muted-foreground text-xs">
                        {pollTypeLabels[round.pollType]}
                        {round.closesAt !== null && (
                            <>
                                {" · "}
                                <RelativeTime value={round.closesAt} prefix="closes" />
                            </>
                        )}
                    </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
            </Link>
        </li>
    );
}

export function HomeView(): ReactNode {
    const { user } = useSession();
    const pipeline = useQuery({ queryKey: queryKeys.pipeline, queryFn: () => platformApi.pipeline() });
    const roundsQuery = { status: RoundStatus.Open, page: 1, perPage: 5 };
    const rounds = useQuery({ queryKey: queryKeys.rounds(roundsQuery), queryFn: () => platformApi.rounds(roundsQuery) });
    const shotsQuery = { status: ShotStatus.Available, page: 1, perPage: 1 };
    const shots = useQuery({ queryKey: queryKeys.shots(shotsQuery), queryFn: () => platformApi.shots(shotsQuery) });
    const myShots = useMyShots(user !== null ? user.id : null);
    const active = myShots.active;

    return (
        <>
            <PageHeader
                title={user === null ? "Project Stairway" : `Welcome back, ${user.username}`}
                description="A community-made Minecraft animated film."
            />
            <div className="space-y-10">
                {active !== null && (
                    <Card className="border-foreground/40">
                        <CardContent className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-muted-foreground text-xs">Your task</p>
                                <p className="truncate font-medium">
                                    {active.shotCode} · {active.title}
                                </p>
                            </div>
                            <Button asChild size="sm">
                                <Link href={`/grabbox/${active.id}` as Route}>Open</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatTile label="Open rounds" value={rounds.data?.meta.total ?? "–"} href="/voting" />
                    <StatTile label="Available tasks" value={shots.data?.meta.total ?? "–"} href="/grabbox" />
                    <StatTile
                        label="Production"
                        value={pipeline.data === undefined ? "–" : `${Math.round(pipeline.data.progressPercent)}%`}
                        hint={pipeline.data?.stepTitle}
                        href="/roadmap"
                    />
                </div>
                <div className="grid gap-10 lg:grid-cols-2">
                    <Section
                        title="Open rounds"
                        actions={
                            <Button asChild variant="ghost" size="sm">
                                <Link href="/voting">View all</Link>
                            </Button>
                        }
                    >
                        {rounds.isPending ? (
                            <LoadingRows rows={2} />
                        ) : rounds.isError ? (
                            <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />
                        ) : rounds.data.data.length === 0 ? (
                            <p className="text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">No open rounds</p>
                        ) : (
                            <ul className="divide-y border">
                                {rounds.data.data.map((round) => (
                                    <RoundRow key={round.id} round={round} />
                                ))}
                            </ul>
                        )}
                    </Section>
                    <Section
                        title="Roadmap"
                        actions={
                            <Button asChild variant="ghost" size="sm">
                                <Link href="/roadmap">View all</Link>
                            </Button>
                        }
                    >
                        {pipeline.isPending ? (
                            <LoadingRows rows={1} />
                        ) : pipeline.isError ? (
                            <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />
                        ) : (
                            <Card>
                                <CardContent>
                                    <PipelineSummary progress={pipeline.data} />
                                </CardContent>
                            </Card>
                        )}
                    </Section>
                </div>
            </div>
        </>
    );
}
