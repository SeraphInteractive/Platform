"use client";

import { Role, RoundStatus, type RoundDetailDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { StatTile } from "@/Components/Common/StatTile";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { useBreadcrumbLabel } from "@/Components/Layout/Breadcrumbs";
import { Alert, AlertDescription } from "@/Components/Ui/alert";
import { Button } from "@/Components/Ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { Standings } from "@/Features/Voting/Standings";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime, pollTypeLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { EntryModeration } from "./EntryModeration";
import { RoundActions } from "./RoundControls";
import { RoundIntegrity } from "./RoundIntegrity";

function RoundDetail({ round }: { readonly round: RoundDetailDto }): ReactNode {
    const { user } = useSession();
    useBreadcrumbLabel(round.id, round.title);
    const [tab, setTab] = useState("entries");

    return (
        <>
            <PageHeader
                title={round.title}
                description={
                    <span className="flex items-center gap-2">
                        <RoundStatusBadge status={round.status} />
                        {pollTypeLabels[round.pollType]}
                    </span>
                }
                actions={
                    <>
                        <Button asChild variant="ghost" size="sm">
                            <Link href={`/voting/${round.id}` as Route}>
                                <ExternalLink />
                                Public page
                            </Link>
                        </Button>
                        <RoundActions round={round} />
                    </>
                }
            />
            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile label="Ballots" value={round.ballotCount} />
                <StatTile label="Eligible entries" value={round.eligibleEntryCount} />
                <StatTile label="Opens" value={<span className="text-sm font-normal">{formatDateTime(round.opensAt)}</span>} />
                <StatTile label="Closes" value={<span className="text-sm font-normal">{formatDateTime(round.closesAt)}</span>} />
            </div>
            {round.warnings.length > 0 && (
                <Alert className="mb-8">
                    <AlertDescription>
                        <ul className="list-inside list-disc">
                            {round.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-6">
                    <TabsTrigger value="entries">Entries</TabsTrigger>
                    <TabsTrigger value="standings">{round.status === RoundStatus.Finalized ? "Results" : "Standings"}</TabsTrigger>
                    <TabsTrigger value="integrity">Integrity</TabsTrigger>
                </TabsList>
                <TabsContent value="entries">
                    <EntryModeration roundId={round.id} />
                </TabsContent>
                <TabsContent value="standings">
                    <Standings round={round} onSelectEntry={() => setTab("entries")} />
                </TabsContent>
                <TabsContent value="integrity">
                    <RoundIntegrity roundId={round.id} live={round.status === RoundStatus.Open} />
                </TabsContent>
            </Tabs>
        </>
    );
}

function RoundLoader({ roundId }: { readonly roundId: string }): ReactNode {
    const round = useQuery({ queryKey: queryKeys.round(roundId), queryFn: () => platformApi.round(roundId) });
    if (round.isPending) {
        return <LoadingRows rows={5} />;
    }
    if (round.isError) {
        return round.error instanceof ApiError && round.error.status === 404 ? (
            <EmptyState title="Round not found" />
        ) : (
            <ErrorState error={round.error} onRetry={() => void round.refetch()} />
        );
    }
    return <RoundDetail round={round.data} />;
}

export function RoundPage({ roundId }: { readonly roundId: string }): ReactNode {
    return (
        <RequireRole role={Role.Moderator}>
            <RoundLoader roundId={roundId} />
        </RequireRole>
    );
}
