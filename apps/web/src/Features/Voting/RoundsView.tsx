"use client";

import { Role, RoundStatus, type RoundDto } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { DataList, DataRow, Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { RoundStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/Components/Ui/toggle-group";
import { useSession } from "@/Hooks/UseSession";
import { pollTypeLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";

const filterLabels: Readonly<Record<RoundStatus, string>> = {
    [RoundStatus.Voting]: "Voting",
    [RoundStatus.Open]: "Submissions",
    [RoundStatus.Finalized]: "Results",
    [RoundStatus.Draft]: "Drafts"
};

const filterOrder: readonly RoundStatus[] = [RoundStatus.Voting, RoundStatus.Open, RoundStatus.Finalized, RoundStatus.Draft];

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

export function RoundsView(): ReactNode {
    const { user } = useSession();
    const [status, setStatus] = useState<RoundStatus>(RoundStatus.Open);
    const [page, setPage] = useState(1);
    const query = { status, page, perPage: 25 };
    const rounds = useQuery({
        queryKey: queryKeys.rounds(query),
        queryFn: () => platformApi.rounds(query),
        placeholderData: keepPreviousData
    });
    const filters = hasAtLeast(user, Role.Moderator) ? filterOrder : filterOrder.filter((item) => item !== RoundStatus.Draft);

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
                        <span className="text-muted-foreground text-xs">{rounds.data.meta.total} rounds</span>
                    )
                }
            >
                <ToggleGroup
                    type="single"
                    size="sm"
                    value={status}
                    onValueChange={(value) => {
                        if (value !== "") {
                            setStatus(value as RoundStatus);
                            setPage(1);
                        }
                    }}
                >
                    {filters.map((item) => (
                        <ToggleGroupItem key={item} value={item} className="px-3">
                            {filterLabels[item]}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            </Toolbar>
            {rounds.isPending ? (
                <LoadingRows rows={5} />
            ) : rounds.isError ? (
                <ErrorState error={rounds.error} onRetry={() => void rounds.refetch()} />
            ) : rounds.data.data.length === 0 ? (
                <EmptyState title="No rounds" />
            ) : (
                <>
                    <DataList>
                        {rounds.data.data.map((round) => (
                            <DataRow
                                key={round.id}
                                href={`/voting/${round.id}` as Route}
                                title={round.title}
                                meta={<Schedule round={round} />}
                                highlight={round.isAcceptingVotes}
                                fields={
                                    <>
                                        {round.isAcceptingVotes && <ToneBadge tone={Tone.Info}>Voting</ToneBadge>}
                                        <span className="text-muted-foreground w-28 text-right text-xs">
                                            {pollTypeLabels[round.pollType]}
                                        </span>
                                        <RoundStatusBadge status={round.status} />
                                    </>
                                }
                            />
                        ))}
                    </DataList>
                    <Pagination meta={rounds.data.meta} onPageChange={setPage} />
                </>
            )}
        </>
    );
}
