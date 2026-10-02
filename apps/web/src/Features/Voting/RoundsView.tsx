"use client";

import { Role, RoundStatus, type RoundDto } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Eye, Sparkles, Trophy, Vote } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { CountdownTimer } from "@/Components/Common/CountdownTimer";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/Components/Ui/toggle-group";
import { useSession } from "@/Hooks/UseSession";
import { pollTypeLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { cn } from "@/Lib/Utils";

type FilterTab = "all_active" | RoundStatus;

const filterLabels: Readonly<Record<FilterTab, string>> = {
    all_active: "All Active",
    [RoundStatus.Voting]: "Voting",
    [RoundStatus.Open]: "Submissions",
    [RoundStatus.Finalized]: "Past Results",
    [RoundStatus.Draft]: "Drafts"
};

const filterOrder: readonly FilterTab[] = ["all_active", RoundStatus.Voting, RoundStatus.Open, RoundStatus.Finalized, RoundStatus.Draft];

function Schedule({ round }: { readonly round: RoundDto }): ReactNode {
    if (round.status === RoundStatus.Voting && round.closesAt !== null) {
        return <RelativeTime value={round.closesAt} prefix="Closes" />;
    }
    if (round.status === RoundStatus.Open && round.closesAt !== null) {
        return <RelativeTime value={round.closesAt} prefix="Submissions close" />;
    }
    if (round.status === RoundStatus.Draft && round.opensAt !== null) {
        return <RelativeTime value={round.opensAt} prefix="Opens" />;
    }
    if (round.status === RoundStatus.Finalized) {
        return <RelativeTime value={round.updatedAt} prefix="Certified" />;
    }
    return <RelativeTime value={round.createdAt} prefix="Created" />;
}

interface RoundCardProps {
    readonly round: RoundDto;
}

function RoundCard({ round }: RoundCardProps): ReactNode {
    const isLiveVoting = round.status === RoundStatus.Voting;
    const isOpenSubmissions = round.status === RoundStatus.Open;
    const isFinalized = round.status === RoundStatus.Finalized;
    const isDraft = round.status === RoundStatus.Draft;

    return (
        <div
            className={cn(
                "group bg-card relative flex flex-col justify-between rounded-lg border p-5 transition-all hover:border-primary/50 hover:shadow-md",
                isLiveVoting && "border-primary/40 bg-gradient-to-b from-primary/5 to-transparent"
            )}
        >
            <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <RoundStatusBadge status={round.status} />
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isLiveVoting && round.closesAt && (
                            <CountdownTimer targetDate={round.closesAt} prefix="Closes" />
                        )}
                        {isOpenSubmissions && round.closesAt && (
                            <CountdownTimer targetDate={round.closesAt} prefix="Due" />
                        )}
                        {isDraft && round.opensAt && (
                            <CountdownTimer targetDate={round.opensAt} prefix="Opens" />
                        )}
                        <span className="text-muted-foreground bg-muted/60 rounded px-2 py-0.5 text-xs font-medium">
                            {pollTypeLabels[round.pollType]}
                        </span>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Link
                        href={`/voting/${round.id}` as Route}
                        className="font-semibold text-base sm:text-lg leading-snug tracking-tight hover:text-primary transition-colors line-clamp-2"
                    >
                        {round.title}
                    </Link>
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Clock className="size-3.5 shrink-0" />
                        <Schedule round={round} />
                    </div>
                </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border/50">
                <Button
                    asChild
                    variant={isLiveVoting ? "default" : isFinalized ? "outline" : isDraft ? "secondary" : "default"}
                    size="sm"
                    className="w-full justify-between font-medium group/btn"
                >
                    <Link href={`/voting/${round.id}` as Route}>
                        <span className="flex items-center gap-1.5 truncate">
                            {isLiveVoting ? (
                                <>
                                    <Vote className="size-4 shrink-0" />
                                    <span>Vote now</span>
                                </>
                            ) : isOpenSubmissions ? (
                                <>
                                    <Sparkles className="size-4 shrink-0" />
                                    <span>Submit entry / Pitch</span>
                                </>
                            ) : isFinalized ? (
                                <>
                                    <Trophy className="size-4 shrink-0" />
                                    <span>View results & standings</span>
                                </>
                            ) : (
                                <>
                                    <Eye className="size-4 shrink-0" />
                                    <span>Preview draft</span>
                                </>
                            )}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 opacity-70 group-hover/btn:translate-x-0.5 transition-transform ml-2" />
                    </Link>
                </Button>
            </div>
        </div>
    );
}

function EmptyTabState({
    tab,
    onSwitchTab
}: {
    readonly tab: FilterTab;
    readonly onSwitchTab: (tab: FilterTab) => void;
}): ReactNode {
    if (tab === "all_active") {
        return (
            <div className="bg-card flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
                <div className="bg-muted rounded-full p-3 text-muted-foreground mb-3">
                    <Vote className="size-6" />
                </div>
                <h3 className="font-semibold text-base">No active rounds right now</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    There are no voting or submission rounds running at the moment. Check past results or check back soon!
                </p>
                <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { onSwitchTab(RoundStatus.Finalized); }}>
                        <Trophy className="size-4 mr-1.5" />
                        View past results
                    </Button>
                </div>
            </div>
        );
    }
    if (tab === RoundStatus.Voting) {
        return (
            <div className="bg-card flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
                <div className="bg-muted rounded-full p-3 text-muted-foreground mb-3">
                    <Vote className="size-6" />
                </div>
                <h3 className="font-semibold text-base">No active voting rounds</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    No rounds are currently accepting ballots. You can check open submissions or explore past results.
                </p>
                <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { onSwitchTab(RoundStatus.Open); }}>
                        <Sparkles className="size-4 mr-1.5" />
                        Check submissions
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { onSwitchTab(RoundStatus.Finalized); }}>
                        <Trophy className="size-4 mr-1.5" />
                        Past results
                    </Button>
                </div>
            </div>
        );
    }
    if (tab === RoundStatus.Open) {
        return (
            <div className="bg-card flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
                <div className="bg-muted rounded-full p-3 text-muted-foreground mb-3">
                    <Sparkles className="size-6" />
                </div>
                <h3 className="font-semibold text-base">No open submissions</h3>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                    No rounds are currently accepting new entries or pitches.
                </p>
                <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { onSwitchTab(RoundStatus.Voting); }}>
                        <Vote className="size-4 mr-1.5" />
                        View live voting
                    </Button>
                </div>
            </div>
        );
    }
    return <EmptyState title="No rounds found" />;
}

export function RoundsView(): ReactNode {
    const { user, isLoading } = useSession();
    const isSupervisor = !isLoading && hasAtLeast(user, Role.Supervisor);
    const [tab, setTab] = useState<FilterTab>("all_active");
    const [page, setPage] = useState(1);
    const activeTab = !isSupervisor && tab === RoundStatus.Draft ? "all_active" : tab;

    const queryStatus = activeTab === "all_active" ? undefined : activeTab;
    const query = { status: queryStatus, page, perPage: activeTab === "all_active" ? 50 : 25 };

    const rounds = useQuery({
        queryKey: queryKeys.rounds(query),
        queryFn: () => platformApi.rounds(query),
        placeholderData: keepPreviousData
    });

    const filters = isSupervisor ? filterOrder : filterOrder.filter((item) => item !== RoundStatus.Draft);

    const displayedRounds =
        activeTab === "all_active"
            ? (rounds.data?.data.filter((r) => r.status === RoundStatus.Voting || r.status === RoundStatus.Open) ?? [])
            : (rounds.data?.data ?? []);

    return (
        <>
            <PageHeader
                title="Voting"
                actions={
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/guidelines#voting">Rules</Link>
                    </Button>
                }
            />
            <Toolbar
                trailing={
                    rounds.data === undefined ? undefined : (
                        <span className="text-muted-foreground text-xs shrink-0">
                            {displayedRounds.length} {displayedRounds.length === 1 ? "round" : "rounds"}
                        </span>
                    )
                }
            >
                <ToggleGroup
                    type="single"
                    size="sm"
                    value={activeTab}
                    onValueChange={(value) => {
                        if (value !== "") {
                            setTab(value as FilterTab);
                            setPage(1);
                        }
                    }}
                    className="flex-nowrap shrink-0"
                >
                    {filters.map((item) => (
                        <ToggleGroupItem key={item} value={item} className="px-2.5 sm:px-3 text-xs sm:text-sm whitespace-nowrap shrink-0">
                            {filterLabels[item]}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Toolbar>
            {rounds.isPending ? (
                <LoadingRows rows={4} />
            ) : rounds.isError ? (
                <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />
            ) : displayedRounds.length === 0 ? (
                <EmptyTabState tab={activeTab} onSwitchTab={(newTab) => { setTab(newTab); }} />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {displayedRounds.map((round) => (
                            <RoundCard key={round.id} round={round} />
                        ))}
                    </div>
                    {activeTab !== "all_active" && <Pagination meta={rounds.data.meta} onPageChange={setPage} />}
                </>
            )}
        </>
    );
}
