"use client";

import { RaidFlag, RaidSeverity } from "@platform/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Scale, ShieldAlert } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { useApprovedEntries } from "@/Features/Voting/UseApprovedEntries";
import { StreamState, useRoundEvents, type RoundEvent } from "@/Hooks/UseRoundEvents";
import { formatNumber, formatPercent } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";
import { InvarianceSummary, NetworkMonitor, ScatterChart } from "./TelemetryCharts";

const severityTones: Readonly<Record<RaidSeverity, Tone>> = {
    [RaidSeverity.Normal]: Tone.Neutral,
    [RaidSeverity.Suspicious]: Tone.Warning,
    [RaidSeverity.CriticalRaid]: Tone.Negative
};

const severityLabels: Readonly<Record<RaidSeverity, string>> = {
    [RaidSeverity.Normal]: "Normal",
    [RaidSeverity.Suspicious]: "Suspicious",
    [RaidSeverity.CriticalRaid]: "Critical"
};

const flagLabels: Readonly<Record<RaidFlag, string>> = {
    [RaidFlag.InsufficientSampleSize]: "Small sample",
    [RaidFlag.UnnaturalRank1HyperSkew]: "Rank-1 skew",
    [RaidFlag.CollapsedRankEntropy]: "Low entropy",
    [RaidFlag.AnomalousVelocityBurst]: "Vote burst"
};

const streamLabels: Readonly<Record<StreamState, string>> = {
    [StreamState.Connecting]: "Connecting",
    [StreamState.Live]: "Live",
    [StreamState.Reconnecting]: "Reconnecting",
    [StreamState.Closed]: "Offline"
};

function SeverityBadge({ severity }: { readonly severity: RaidSeverity }): ReactNode {
    return <ToneBadge tone={severityTones[severity]}>{severityLabels[severity]}</ToneBadge>;
}

function describeEvent(event: RoundEvent, titleOf: (entryId: string) => string): string {
    if (event.type === "ballot.submitted") {
        return `Ballot: ${event.entryIds.map(titleOf).join(", ")}`;
    }
    if (event.type === "raid.alert") {
        return `${severityLabels[event.severity]} alert: ${titleOf(event.entryId)} (${formatNumber(event.compositeScore)})`;
    }
    return "Round finalized";
}

function LiveFeed({
    events,
    state,
    titleOf
}: {
    readonly events: readonly RoundEvent[];
    readonly state: StreamState;
    readonly titleOf: (entryId: string) => string;
}): ReactNode {
    return (
        <Section
            title="Live Stream"
            actions={
                <span className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span
                        className={cn(
                            "size-2 rounded-full",
                            state === StreamState.Live ? "bg-success" : state === StreamState.Closed ? "bg-destructive" : "bg-warning"
                        )}
                        aria-hidden="true"
                    />
                    {streamLabels[state]}
                </span>
            }
        >
            {events.length === 0 ? (
                <p className="text-muted-foreground border border-dashed px-4 py-6 text-center text-sm">No activity yet</p>
            ) : (
                <ol className="max-h-72 divide-y overflow-y-auto border" aria-live="polite">
                    {events.map((event, index) => (
                        <li
                            key={`${event.occurredAt}-${String(index)}`}
                            className={cn("flex items-center gap-3 px-4 py-2 text-sm", event.type === "raid.alert" && "text-destructive")}
                        >
                            <span className="min-w-0 flex-1 truncate">{describeEvent(event, titleOf)}</span>
                            <span className="text-muted-foreground shrink-0 text-xs">
                                <RelativeTime value={event.occurredAt} />
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </Section>
    );
}

export interface RoundIntegrityProps {
    readonly roundId: string;
    readonly live: boolean;
    readonly defaultTab?: "raid" | "invariance" | "network";
}

export function RoundIntegrity({ roundId, live, defaultTab = "raid" }: RoundIntegrityProps): ReactNode {
    const queryClient = useQueryClient();
    const roundEvents = useRoundEvents(roundId, live);
    const lastRefresh = useRef(0);
    const latestEvent = roundEvents.events[0];

    useEffect(() => {
        if (latestEvent === undefined || Date.now() - lastRefresh.current < 5_000) {
            return;
        }
        lastRefresh.current = Date.now();
        void queryClient.invalidateQueries({ queryKey: queryKeys.telemetry(roundId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard(roundId) });
    }, [latestEvent, queryClient, roundId]);

    const telemetry = useQuery({
        queryKey: queryKeys.telemetry(roundId),
        queryFn: () => platformApi.telemetry(roundId),
        refetchInterval: 60_000
    });
    const leaderboard = useQuery({
        queryKey: queryKeys.leaderboard(roundId),
        queryFn: () => platformApi.leaderboard(roundId)
    });
    const entries = useApprovedEntries(roundId);
    const titles = new Map((entries.data ?? []).map((entry) => [entry.id, entry.title]));
    const titleOf = (entryId: string): string => titles.get(entryId) ?? "Unknown entry";

    return (
        <div className="space-y-6">
            <Tabs defaultValue={defaultTab} className="space-y-6">
                <TabsList>
                    <TabsTrigger value="raid" className="flex items-center gap-1.5">
                        <ShieldAlert className="size-3.5" />
                        <span>Raid Detection</span>
                    </TabsTrigger>
                    <TabsTrigger value="invariance" className="flex items-center gap-1.5">
                        <Scale className="size-3.5" />
                        <span>Invariance</span>
                    </TabsTrigger>
                    <TabsTrigger value="network" className="flex items-center gap-1.5">
                        <Activity className="size-3.5" />
                        <span>Responsiveness</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="raid" className="space-y-6">
                    {live && <LiveFeed events={roundEvents.events} state={roundEvents.state} titleOf={titleOf} />}
                    <Section title="Raid Defense">
                        <ScatterChart
                            telemetryList={telemetry.data ?? []}
                            leaderboardItems={leaderboard.data?.items ?? []}
                            titleOf={titleOf}
                        />
                    </Section>
                    <Section title="Anomaly Checks">
                        {telemetry.isPending ? (
                            <LoadingRows rows={4} />
                        ) : telemetry.isError ? (
                            <ErrorState error={telemetry.error} onRetry={() => void telemetry.refetch()} />
                        ) : telemetry.data.length === 0 ? (
                            <EmptyState title="No checks yet" />
                        ) : (
                            <div className="overflow-x-auto border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Entry</TableHead>
                                            <TableHead>Severity</TableHead>
                                            <TableHead className="text-right">Score</TableHead>
                                            <TableHead className="text-right">Rank-1 share</TableHead>
                                            <TableHead>Flags</TableHead>
                                            <TableHead className="text-right">Checked</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[...telemetry.data]
                                            .sort((left, right) => right.compositeScore - left.compositeScore)
                                            .map((row) => (
                                                <TableRow key={row.id}>
                                                    <TableCell className="max-w-56 truncate">{titleOf(row.entryId)}</TableCell>
                                                    <TableCell>
                                                        <SeverityBadge severity={row.severity} />
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatNumber(row.compositeScore)}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {formatPercent(row.breakdown.topRankShare * 100)}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {row.flags.map((flag) => flagLabels[flag]).join(", ") || "–"}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">
                                                        <RelativeTime value={row.createdAt} />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </Section>
                </TabsContent>

                <TabsContent value="invariance" className="space-y-6">
                    <Section title="Bayesian Regularization & Invariance">
                        {leaderboard.isPending ? (
                            <LoadingRows rows={4} />
                        ) : leaderboard.isError ? (
                            <ErrorState error={leaderboard.error} onRetry={() => void leaderboard.refetch()} />
                        ) : leaderboard.data === undefined || leaderboard.data.items.length === 0 ? (
                            <EmptyState title="No entries to evaluate" />
                        ) : (
                            <InvarianceSummary
                                items={leaderboard.data.items}
                                totalBallots={leaderboard.data.totalBallots}
                                totalPoints={leaderboard.data.totalPoints}
                                isConserved={leaderboard.data.isConserved}
                            />
                        )}
                    </Section>
                </TabsContent>

                <TabsContent value="network" className="space-y-6">
                    <Section title="Responsiveness Monitor">
                        <NetworkMonitor />
                    </Section>
                </TabsContent>
            </Tabs>
        </div>
    );
}
