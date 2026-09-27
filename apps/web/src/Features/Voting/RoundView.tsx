"use client";

import { Role, RoundStatus, type EntryDto, type RoundDetailDto } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { useBreadcrumbLabel } from "@/Components/Layout/Breadcrumbs";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Pagination } from "@/Components/Common/Pagination";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/Ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime, pluralize, pollTypeLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { BallotPanel } from "./BallotPanel";
import { EntryMedia } from "./EntryMedia";
import { Standings } from "./Standings";
import { SubmitEntryDialog } from "./SubmitEntryDialog";
import { useApprovedEntries } from "./UseApprovedEntries";

function EntriesGrid({ roundId }: { readonly roundId: string }): ReactNode {
    const entries = useApprovedEntries(roundId);
    if (entries.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (entries.isError) {
        return <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />;
    }
    if (entries.data.length === 0) {
        return <EmptyState title="No approved entries yet" />;
    }
    return (
        <ul className="grid gap-4 sm:grid-cols-2">
            {entries.data.map((entry) => (
                <li key={entry.id}>
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-sm">{entry.title}</CardTitle>
                            {entry.description !== null && (
                                <MarkdownText className="text-muted-foreground text-sm">{entry.description}</MarkdownText>
                            )}
                        </CardHeader>
                        <CardContent>
                            <EntryMedia url={entry.mediaUrl} title={entry.title} />
                            {entry.isQuarantined && <p className="text-warning mt-2 text-xs">Under review for suspicious voting.</p>}
                        </CardContent>
                    </Card>
                </li>
            ))}
        </ul>
    );
}

function Ledger({ roundId, entries }: { readonly roundId: string; readonly entries: readonly EntryDto[] }): ReactNode {
    const [page, setPage] = useState(1);
    const ledger = useQuery({
        queryKey: queryKeys.ledger(roundId, page),
        queryFn: () => platformApi.ledger(roundId, { page, perPage: 50 }),
        placeholderData: keepPreviousData
    });
    const titles = new Map(entries.map((entry) => [entry.id, entry.title]));
    if (ledger.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (ledger.isError) {
        return <ErrorState error={ledger.error} onRetry={() => void ledger.refetch()} />;
    }
    if (ledger.data.data.length === 0) {
        return <EmptyState title="No ballots yet" />;
    }
    return (
        <div className="space-y-2">
            <p className="text-muted-foreground text-xs">Every counted ballot under a pseudonym, so anyone can re-tally the result.</p>
            <div className="overflow-x-auto border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Voter</TableHead>
                            <TableHead>Picks</TableHead>
                            <TableHead className="text-right">Cast</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ledger.data.data.map((row) => (
                            <TableRow key={row.voter}>
                                <TableCell className="text-muted-foreground max-w-32 truncate">{row.voter}</TableCell>
                                <TableCell className="max-w-96">
                                    <ol className="space-y-0.5">
                                        {row.picks.map((pick, index) => (
                                            <li key={pick} className="truncate">
                                                {index + 1}. {titles.get(pick) ?? pick}
                                            </li>
                                        ))}
                                    </ol>
                                </TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatDateTime(row.castAt)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <Pagination meta={ledger.data.meta} onPageChange={setPage} />
        </div>
    );
}

function RoundDetail({ round }: { readonly round: RoundDetailDto }): ReactNode {
    const { user } = useSession();
    const entries = useApprovedEntries(round.id);
    useBreadcrumbLabel(round.id, round.title);
    const canPropose = user !== null && (round.status === RoundStatus.Open || round.status === RoundStatus.Draft);
    const [tab, setTab] = useState(round.isAcceptingVotes ? "vote" : round.status === RoundStatus.Finalized ? "standings" : "entries");

    return (
        <>
            <PageHeader
                eyebrow={pollTypeLabels[round.pollType]}
                title={round.title}
                description={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <RoundStatusBadge status={round.status} />
                        <span>{pluralize(round.ballotCount, "ballot")}</span>
                        <span>{pluralize(round.eligibleEntryCount, "entry", "entries")} on the ballot</span>
                        {round.status === RoundStatus.Open && round.closesAt !== null && (
                            <RelativeTime value={round.closesAt} prefix="Closes" />
                        )}
                        {round.status === RoundStatus.Draft && round.opensAt !== null && (
                            <RelativeTime value={round.opensAt} prefix="Opens" />
                        )}
                    </span>
                }
                actions={
                    !canPropose ? undefined : hasAtLeast(user, Role.Voter) ? (
                        <SubmitEntryDialog round={round} />
                    ) : (
                        <Button asChild size="sm" variant="outline">
                            <Link href="/verify">Verify to propose</Link>
                        </Button>
                    )
                }
            />
            {hasAtLeast(user, Role.Moderator) && round.warnings.length > 0 && (
                <Alert className="mb-6">
                    <AlertTriangle />
                    <AlertTitle>Staff note</AlertTitle>
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
                    <TabsTrigger value="vote">{round.isAcceptingVotes ? "Your vote" : "Vote"}</TabsTrigger>
                    <TabsTrigger value="entries">Entries</TabsTrigger>
                    <TabsTrigger value="standings">{round.status === RoundStatus.Finalized ? "Results" : "Standings"}</TabsTrigger>
                    <TabsTrigger value="ledger">Ledger</TabsTrigger>
                </TabsList>
                <TabsContent value="vote">
                    <BallotPanel round={round} />
                </TabsContent>
                <TabsContent value="entries">
                    <EntriesGrid roundId={round.id} />
                </TabsContent>
                <TabsContent value="standings">
                    <Standings round={round} />
                </TabsContent>
                <TabsContent value="ledger">
                    <Ledger roundId={round.id} entries={entries.data ?? []} />
                </TabsContent>
            </Tabs>
        </>
    );
}

export function RoundView({ roundId }: { readonly roundId: string }): ReactNode {
    const round = useQuery({ queryKey: queryKeys.round(roundId), queryFn: () => platformApi.round(roundId) });
    if (round.isPending) {
        return <LoadingRows rows={5} />;
    }
    if (round.isError) {
        return round.error instanceof ApiError && round.error.status === 404 ? (
            <EmptyState title="Round not found">It may have been removed, or it isn&apos;t public yet.</EmptyState>
        ) : (
            <ErrorState error={round.error} onRetry={() => void round.refetch()} />
        );
    }
    return <RoundDetail round={round.data} />;
}
