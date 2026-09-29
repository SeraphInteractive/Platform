"use client";

import { Role, RoundStatus, type RoundDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { pollTypeLabels, roundStatusLabels } from "@/Lib/Format";
import { RoundIntegrity } from "./RoundIntegrity";

function TelemetryView(): ReactNode {
    const searchParams = useSearchParams();
    const queryRoundId = searchParams.get("roundId");

    const rounds = useQuery({
        queryKey: queryKeys.rounds({ page: 1, perPage: 100 }),
        queryFn: () => platformApi.rounds({ page: 1, perPage: 100 })
    });

    const roundList: readonly RoundDto[] = rounds.data?.data ?? [];

    // prefer open rounds, then drafts, then closed
    const defaultRound = useMemo(() => {
        if (queryRoundId !== null) {
            const found = roundList.find((r) => r.id === queryRoundId);
            if (found !== undefined) return found;
        }
        return (
            roundList.find((r) => r.status === RoundStatus.Open) ??
            roundList.find((r) => r.status === RoundStatus.Draft) ??
            roundList[0] ??
            null
        );
    }, [roundList, queryRoundId]);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const activeRound = roundList.find((r) => r.id === (selectedId ?? defaultRound?.id)) ?? defaultRound;

    const roundDetail = useQuery({
        queryKey: queryKeys.round(activeRound?.id ?? ""),
        queryFn: () => platformApi.round(activeRound?.id ?? ""),
        enabled: activeRound !== null
    });

    if (rounds.isPending) {
        return <LoadingRows rows={6} />;
    }

    if (rounds.isError) {
        return <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />;
    }

    if (roundList.length === 0 || activeRound === null) {
        return (
            <EmptyState title="No voting rounds found">
                Create a voting round to begin collecting telemetry and monitoring ballot activity.
            </EmptyState>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <Select
                        value={activeRound.id}
                        onValueChange={(val) => {
                            setSelectedId(val);
                        }}
                    >
                        <SelectTrigger className="w-72">
                            <SelectValue placeholder="Select round" />
                        </SelectTrigger>
                        <SelectContent>
                            {roundList.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                    <span className="truncate">{r.title}</span>
                                    <span className="text-muted-foreground ml-2 text-[11px]">({roundStatusLabels[r.status]})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <RoundStatusBadge status={activeRound.status} />
                </div>
                <div className="text-muted-foreground flex items-center gap-3 text-xs font-mono">
                    <span>{pollTypeLabels[activeRound.pollType]}</span>
                    {roundDetail.data !== undefined && (
                        <>
                            <span>·</span>
                            <span>{roundDetail.data.ballotCount} ballots</span>
                            <span>·</span>
                            <span>{roundDetail.data.eligibleEntryCount} entries</span>
                        </>
                    )}
                </div>
            </div>

            <RoundIntegrity roundId={activeRound.id} live={activeRound.status === RoundStatus.Open} />
        </div>
    );
}

export function TelemetryPage(): ReactNode {
    return (
        <RequireRole role={Role.Moderator}>
            <PageHeader title="Telemetry" description="Raid defense, Bayesian invariance and ballot co-occurrence network." />
            <TelemetryView />
        </RequireRole>
    );
}
