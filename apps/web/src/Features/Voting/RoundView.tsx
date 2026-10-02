"use client";

import { PollType, Role, RoundStatus, type EntryDto, type RoundDetailDto } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { EntryStatusBadge, RoundStatusBadge } from "@/Components/Common/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/Components/Ui/dialog";
import { Skeleton } from "@/Components/Ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { useBreadcrumbLabel } from "@/Components/Layout/Breadcrumbs";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime, pluralize, pollTypeLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { cn } from "@/Lib/Utils";
import { BallotPanel } from "./BallotPanel";
import { EntryMedia } from "./EntryMedia";
import { Standings } from "./Standings";
import { SubmitEntryDialog } from "./SubmitEntryDialog";
import { useApprovedEntries } from "./UseApprovedEntries";

function EntryDetailDialog({
    entry,
    open,
    onOpenChange,
    isMyEntry
}: {
    readonly entry: EntryDto | null;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly isMyEntry: boolean;
}): ReactNode {
    const { user } = useSession();
    const isStaff = user !== null && hasAtLeast(user, Role.Moderator);
    if (entry === null) {
        return null;
    }
    const authorAvatar = entry.author?.avatarUrl ? safeHttpUrl(entry.author.avatarUrl) : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <EntryStatusBadge status={entry.status} />
                        {isMyEntry && (
                            <span className="bg-primary/15 text-primary border-primary/30 border rounded-sm px-1.5 py-0.5 text-[11px] font-semibold">
                                Your Submission
                            </span>
                        )}
                        {entry.isQuarantined && (
                            <span className="bg-destructive/15 text-destructive border-destructive/30 border rounded-sm px-1.5 py-0.5 text-[11px] font-semibold">
                                Quarantined
                            </span>
                        )}
                    </div>
                    <DialogTitle className="text-lg font-bold leading-tight">{entry.title}</DialogTitle>
                    <DialogDescription asChild>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                            {entry.author !== null && (
                                <div className="flex items-center gap-1.5">
                                    <Avatar size="sm" className="size-5 border">
                                        {authorAvatar !== null && <AvatarImage src={authorAvatar} alt="" />}
                                        <AvatarFallback className="text-[9px] font-semibold">
                                            {entry.author.username.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-foreground">@{entry.author.username}</span>
                                </div>
                            )}
                            <span>Submitted {formatDateTime(entry.createdAt)}</span>
                        </div>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {entry.mediaUrl !== null && (
                        <div className="overflow-hidden rounded-lg border bg-black/30">
                            <EntryMedia url={entry.mediaUrl} title={entry.title} controls className="max-h-96 object-contain" />
                        </div>
                    )}

                    {isMyEntry && (
                        <div className="bg-primary/5 border-primary/25 text-foreground rounded-lg border p-3 text-xs flex items-center gap-2">
                            <Sparkles className="size-4 text-primary shrink-0" />
                            <span>This is your pitch submission for this voting round.</span>
                        </div>
                    )}

                    {entry.description !== null && (
                        <div className="space-y-1.5">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pitch Details</h4>
                            <div className="bg-muted/30 rounded-lg p-3.5 border text-sm leading-relaxed">
                                <MarkdownText>{entry.description}</MarkdownText>
                            </div>
                        </div>
                    )}

                    {isStaff && entry.aiFlags.length > 0 && (
                        <div className="border-warning/40 bg-warning/5 rounded-lg border p-3 text-xs text-warning space-y-1">
                            <p className="font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="size-3.5" /> AI Signature Flags Detected:
                            </p>
                            <p className="text-muted-foreground font-mono">{entry.aiFlags.join(", ")}</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function EntryCard({
    entry,
    onClick
}: {
    readonly entry: EntryDto;
    readonly onClick: () => void;
}): ReactNode {
    const { user } = useSession();
    const isMyEntry = user !== null && entry.submittedBy === user.id;
    const authorAvatar = entry.author?.avatarUrl ? safeHttpUrl(entry.author.avatarUrl) : null;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={cn(
                "group bg-card text-card-foreground hover:border-primary/50 focus-visible:ring-ring flex flex-col overflow-hidden rounded-xl border shadow-xs transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 cursor-pointer",
                isMyEntry && "border-primary/30 bg-primary/[0.02]"
            )}
        >
            <div className="relative aspect-video w-full overflow-hidden bg-muted/40 border-b">
                {entry.mediaUrl !== null ? (
                    <EntryMedia
                        url={entry.mediaUrl}
                        title={entry.title}
                        controls={false}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground/40 bg-muted/20">
                        <Sparkles className="size-8 stroke-[1.25]" aria-hidden="true" />
                        <span className="text-[11px] font-medium tracking-wide">Pitch Idea</span>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    {isMyEntry && (
                        <span className="bg-primary/95 text-primary-foreground shadow-xs backdrop-blur-xs rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide border border-primary/40">
                            Your Entry
                        </span>
                    )}
                </div>
                <div className="absolute top-2 right-2">
                    <EntryStatusBadge status={entry.status} />
                </div>
            </div>

            <div className="flex flex-1 flex-col p-3.5 gap-2">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                    {entry.title}
                </h3>

                {entry.description !== null && (
                    <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">
                        {entry.description}
                    </p>
                )}

                <div className="mt-auto pt-2.5 border-t flex items-center justify-between text-xs text-muted-foreground gap-2">
                    {entry.author !== null ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                            <Avatar size="sm" className="size-5 border">
                                {authorAvatar !== null && <AvatarImage src={authorAvatar} alt="" />}
                                <AvatarFallback className="text-[9px] font-semibold">
                                    {entry.author.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate font-medium text-foreground">
                                {isMyEntry ? "You" : `@${entry.author.username}`}
                            </span>
                        </div>
                    ) : isMyEntry ? (
                        <span className="font-medium text-primary">Submitted by you</span>
                    ) : (
                        <span className="text-muted-foreground">Community pitch</span>
                    )}

                    <span className="text-muted-foreground shrink-0 text-[11px]">
                        <RelativeTime value={entry.createdAt} />
                    </span>
                </div>
            </div>
        </div>
    );
}

function EntriesGrid({
    roundId,
    selectedEntryId,
    onSelectEntry
}: {
    readonly roundId: string;
    readonly selectedEntryId: string | null;
    readonly onSelectEntry: (entryId: string | null) => void;
}): ReactNode {
    const entries = useApprovedEntries(roundId);
    const { user } = useSession();
    const selectedEntry = entries.data?.find((e) => e.id === selectedEntryId) ?? null;

    if (entries.isPending) {
        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="bg-card flex flex-col overflow-hidden rounded-xl border">
                        <Skeleton className="aspect-video w-full rounded-none" />
                        <div className="flex flex-1 flex-col p-3.5 gap-2.5">
                            <Skeleton className="h-4 w-4/5" />
                            <Skeleton className="h-3 w-3/5" />
                            <div className="mt-auto pt-2.5 border-t">
                                <Skeleton className="h-3.5 w-1/3" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (entries.isError) {
        return <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />;
    }
    if (entries.data.length === 0) {
        return <EmptyState title="No approved entries yet" />;
    }
    return (
        <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {entries.data.map((entry) => (
                    <EntryCard
                        key={entry.id}
                        entry={entry}
                        onClick={() => onSelectEntry(entry.id)}
                    />
                ))}
            </div>
            <EntryDetailDialog
                entry={selectedEntry}
                open={selectedEntry !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        onSelectEntry(null);
                    }
                }}
                isMyEntry={user !== null && selectedEntry !== null && selectedEntry.submittedBy === user.id}
            />
        </>
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
            <p className="text-muted-foreground text-xs">Supervisor audit ledger displaying recorded voter Discord IDs and picks.</p>
            <div className="overflow-x-auto border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Discord User</TableHead>
                            <TableHead>Discord ID</TableHead>
                            <TableHead>Picks</TableHead>
                            <TableHead className="text-right">Cast</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {ledger.data.data.map((row) => (
                            <TableRow key={`${row.discordId}-${row.castAt}`}>
                                <TableCell className="font-medium truncate max-w-40">@{row.discordUsername}</TableCell>
                                <TableCell className="text-muted-foreground font-mono text-xs">{row.discordId}</TableCell>
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
    const canPropose = user !== null && round.status === RoundStatus.Open && round.pollType !== PollType.Binary;
    const isSupervisor = hasAtLeast(user, Role.Supervisor);
    const [tab, setTab] = useState(round.isAcceptingVotes ? "vote" : round.status === RoundStatus.Finalized ? "standings" : "entries");
    const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

    const handleSelectEntry = (entryId: string): void => {
        setSelectedEntryId(entryId);
        setTab("entries");
    };

    const isAdmin = user !== null && hasAtLeast(user, Role.Admin);
    const hasAlreadySubmitted = !isAdmin && user !== null && (entries.data?.some((e) => e.submittedBy === user.id) ?? false);

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
                    !canPropose ? undefined : hasAlreadySubmitted ? (
                        <Button size="sm" variant="outline" disabled title="You can only submit one entry per round.">
                            Entry submitted
                        </Button>
                    ) : hasAtLeast(user, Role.Voter) ? (
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
                    {isSupervisor && <TabsTrigger value="ledger">Ledger</TabsTrigger>}
                </TabsList>
                <TabsContent value="vote">
                    <BallotPanel round={round} />
                </TabsContent>
                <TabsContent value="entries">
                    <EntriesGrid
                        roundId={round.id}
                        selectedEntryId={selectedEntryId}
                        onSelectEntry={setSelectedEntryId}
                    />
                </TabsContent>
                <TabsContent value="standings">
                    <Standings round={round} onSelectEntry={handleSelectEntry} />
                </TabsContent>
                {isSupervisor && (
                    <TabsContent value="ledger">
                        <Ledger roundId={round.id} entries={entries.data ?? []} />
                    </TabsContent>
                )}
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
