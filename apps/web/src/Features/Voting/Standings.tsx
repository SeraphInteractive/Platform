"use client";

import { RoundStatus, SeparationStatus, type LeaderboardItemDto, type RoundDetailDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { formatDateTime, formatNumber, formatPercent, pluralize } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

function StandingsTable({ items }: { readonly items: readonly LeaderboardItemDto[] }): ReactNode {
    if (items.length === 0) {
        return <EmptyState title="No votes yet" />;
    }
    const showRegularized = items.some((item) => item.regularizedTotalScore !== null);
    return (
        <div className="overflow-x-auto border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Entry</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                        {showRegularized && <TableHead className="text-right">Adjusted</TableHead>}
                        <TableHead className="text-right">Ballots</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item) => (
                        <TableRow key={item.entryId}>
                            <TableCell className="tabular-nums">{item.position}</TableCell>
                            <TableCell className="min-w-48">
                                <span className="block max-w-80 truncate">{item.title}</span>
                                <span className="bg-muted mt-1.5 block h-1.5 w-full max-w-80 overflow-hidden" aria-hidden="true">
                                    <span
                                        className={cn("block h-full", item.position === 1 ? "bg-foreground" : "bg-foreground/40")}
                                        style={{ width: `${Math.max(0, Math.min(100, item.voteSharePercentage))}%` }}
                                    />
                                </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(item.rawScore)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatPercent(item.voteSharePercentage)}</TableCell>
                            {showRegularized && (
                                <TableCell className="text-right tabular-nums">
                                    {item.regularizedTotalScore === null ? "—" : formatNumber(item.regularizedTotalScore)}
                                </TableCell>
                            )}
                            <TableCell className="text-right tabular-nums">{item.appearanceCount}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function LiveStandings({ roundId }: { readonly roundId: string }): ReactNode {
    const leaderboard = useQuery({
        queryKey: queryKeys.leaderboard(roundId),
        queryFn: () => platformApi.leaderboard(roundId),
        refetchInterval: 30_000
    });
    if (leaderboard.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (leaderboard.isError) {
        return <ErrorState error={leaderboard.error} onRetry={() => void leaderboard.refetch()} />;
    }
    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-xs">
                {pluralize(leaderboard.data.totalBallots, "ballot")} · updated {formatDateTime(leaderboard.data.computedAt)}
            </p>
            <StandingsTable items={leaderboard.data.items} />
        </div>
    );
}

function CertifiedResults({ roundId }: { readonly roundId: string }): ReactNode {
    const results = useQuery({ queryKey: queryKeys.results(roundId), queryFn: () => platformApi.results(roundId), staleTime: Infinity });
    if (results.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (results.isError) {
        return <ErrorState error={results.error} onRetry={() => void results.refetch()} />;
    }
    const [first] = results.data.separations;
    const [winner] = results.data.leaderboard;
    return (
        <div className="space-y-4">
            {winner !== undefined && (
                <div className="border-foreground/40 border p-4">
                    <p className="text-muted-foreground text-xs tracking-wider uppercase">
                        {first?.status === SeparationStatus.StatisticalTie ? "Top of the count" : "Winner"}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-balance">{winner.title}</p>
                    <p className="text-muted-foreground text-sm">
                        {formatPercent(winner.voteSharePercentage)} of the points
                        {first?.status === SeparationStatus.StatisticalTie && ", too close to call against the runner-up"}
                    </p>
                </div>
            )}
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                <span>
                    Certified {formatDateTime(results.data.finalizedAt)} · {pluralize(results.data.totalBallots, "ballot")}
                </span>
                {first !== undefined &&
                    (first.status === SeparationStatus.DecisiveLead ? (
                        <ToneBadge tone={Tone.Positive}>Decisive winner</ToneBadge>
                    ) : (
                        <ToneBadge tone={Tone.Warning}>Statistical tie at the top</ToneBadge>
                    ))}
            </div>
            <StandingsTable items={results.data.leaderboard} />
        </div>
    );
}

export function Standings({ round }: { readonly round: RoundDetailDto }): ReactNode {
    return round.status === RoundStatus.Finalized ? <CertifiedResults roundId={round.id} /> : <LiveStandings roundId={round.id} />;
}
