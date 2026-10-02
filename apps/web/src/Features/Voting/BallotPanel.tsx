"use client";

import { PollType, Role, type EntryDto, type RoundDetailDto } from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, GripVertical, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ApiError, describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { EmptyState, ErrorState, LoadingRows, SignInPrompt } from "@/Components/Common/States";
import { Alert, AlertDescription } from "@/Components/Ui/alert";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/Ui/card";
import { useSession } from "@/Hooks/UseSession";
import { formatDateTime } from "@/Lib/Format";
import { insertPickAt, movePick, samePicks, togglePick } from "@/Lib/Ranking";
import { hasAtLeast } from "@/Lib/Roles";
import { cn } from "@/Lib/Utils";
import { EntryMedia } from "./EntryMedia";
import { isEligible, requiredPicks, useApprovedEntries } from "./UseApprovedEntries";

async function fetchMyBallot(roundId: string): Promise<string[] | null> {
    try {
        return (await platformApi.myBallot(roundId)).picks;
    } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) {
            return null;
        }
        throw error;
    }
}

interface BallotEditorProps {
    readonly round: RoundDetailDto;
    readonly entries: readonly EntryDto[];
    readonly savedPicks: readonly string[] | null;
}

function BallotEditor({ round, entries, savedPicks }: BallotEditorProps): ReactNode {
    const queryClient = useQueryClient();
    const required = requiredPicks[round.pollType];
    const eligibleIds = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
    const [picks, setPicks] = useState<string[]>(() => (savedPicks ?? []).filter((pick) => eligibleIds.has(pick)));
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
    const entriesById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

    const cast = useMutation({
        mutationFn: (selection: readonly string[]) => platformApi.castBallot(round.id, selection),
        onSuccess: (ballot) => {
            queryClient.setQueryData(queryKeys.myBallot(round.id), ballot.picks);
            void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard(round.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.round(round.id) });
            toast.success(savedPicks === null ? "Your vote is in." : "Your ballot was updated.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const toggle = (entryId: string): void => {
        setPicks((current) => togglePick(current, entryId, required));
    };

    const isUnchanged = samePicks(savedPicks, picks);

    return (
        <div className="space-y-6">
            {round.pollType === PollType.RankedChoice && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Your ranking</CardTitle>
                        <CardDescription>Drag and drop entries into rank slots or pick exactly {required} entries, best first.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol className="space-y-2">
                            {Array.from({ length: required }, (_, index) => {
                                const pick = picks[index];
                                const entry = pick === undefined ? undefined : entriesById.get(pick);
                                const isHovered = dragOverIndex === index;
                                return (
                                    <li
                                        key={index}
                                        draggable={pick !== undefined && !cast.isPending}
                                        onDragStart={(e) => {
                                            if (!pick) return;
                                            e.dataTransfer.setData("application/x-project-stairway-entry", pick);
                                            e.dataTransfer.effectAllowed = "move";
                                            setDraggedEntryId(pick);
                                        }}
                                        onDragEnd={() => {
                                            setDraggedEntryId(null);
                                            setDragOverIndex(null);
                                        }}
                                        onDragOver={(e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = "move";
                                        }}
                                        onDragEnter={(e) => {
                                            e.preventDefault();
                                            setDragOverIndex(index);
                                        }}
                                        onDragLeave={(e) => {
                                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                setDragOverIndex((curr) => (curr === index ? null : curr));
                                            }
                                        }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            const entryId = e.dataTransfer.getData("application/x-project-stairway-entry");
                                            if (entryId && eligibleIds.has(entryId)) {
                                                setPicks((current) => insertPickAt(current, entryId, index, required));
                                            }
                                            setDragOverIndex(null);
                                            setDraggedEntryId(null);
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 border px-3 py-2 text-sm transition-colors",
                                            pick !== undefined && "cursor-grab active:cursor-grabbing",
                                            isHovered ? "border-primary bg-primary/10 border-dashed" : "border-border",
                                            draggedEntryId === pick && "opacity-50"
                                        )}
                                    >
                                        <span className="text-muted-foreground w-6 tabular-nums">#{index + 1}</span>
                                        <span className={cn("flex-1 truncate", entry === undefined && "text-muted-foreground")}>
                                            {isHovered ? (
                                                <span className="text-primary font-medium">Drop to set #{index + 1}</span>
                                            ) : (
                                                (entry?.title ?? "Empty")
                                            )}
                                        </span>
                                        {pick !== undefined && (
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="icon-xs"
                                                    variant="ghost"
                                                    aria-label="Move up"
                                                    disabled={index === 0}
                                                    onClick={() => {
                                                        setPicks((current) => movePick(current, index, -1));
                                                    }}
                                                >
                                                    <ArrowUp />
                                                </Button>
                                                <Button
                                                    size="icon-xs"
                                                    variant="ghost"
                                                    aria-label="Move down"
                                                    disabled={index === picks.length - 1}
                                                    onClick={() => {
                                                        setPicks((current) => movePick(current, index, 1));
                                                    }}
                                                >
                                                    <ArrowDown />
                                                </Button>
                                                <Button
                                                    size="icon-xs"
                                                    variant="ghost"
                                                    aria-label="Remove"
                                                    onClick={() => {
                                                        toggle(pick);
                                                    }}
                                                >
                                                    <X />
                                                </Button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </CardContent>
                </Card>
            )}
            <ul className="grid gap-4 sm:grid-cols-2">
                {entries.map((entry) => {
                    const position = picks.indexOf(entry.id);
                    const isPicked = position >= 0;
                    return (
                        <li key={entry.id} className="min-w-0">
                            <Card
                                draggable={!cast.isPending}
                                onDragStart={(e) => {
                                    e.dataTransfer.setData("application/x-project-stairway-entry", entry.id);
                                    e.dataTransfer.effectAllowed = "copyMove";
                                    setDraggedEntryId(entry.id);
                                }}
                                onDragEnd={() => {
                                    setDraggedEntryId(null);
                                    setDragOverIndex(null);
                                }}
                                className={cn(
                                    "h-full min-w-0 overflow-hidden transition-all",
                                    round.pollType === PollType.RankedChoice && "cursor-grab active:cursor-grabbing",
                                    isPicked && "border-foreground",
                                    draggedEntryId === entry.id && "opacity-50"
                                )}
                            >
                                <CardHeader className="min-w-0 overflow-hidden break-words [overflow-wrap:anywhere]">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-sm min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                            {entry.title}
                                        </CardTitle>
                                        {round.pollType === PollType.RankedChoice && (
                                            <GripVertical className="text-muted-foreground/60 h-4 w-4 shrink-0" />
                                        )}
                                    </div>
                                    {entry.description !== null && (
                                        <MarkdownText className="text-muted-foreground text-sm min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]">{entry.description}</MarkdownText>
                                    )}
                                </CardHeader>
                                <CardContent className="space-y-3 min-w-0 break-words [overflow-wrap:anywhere] [word-break:break-word]">
                                    <EntryMedia url={entry.mediaUrl} title={entry.title} />
                                    <Button
                                        size="sm"
                                        className="w-full"
                                        variant={isPicked ? "default" : "outline"}
                                        aria-pressed={isPicked}
                                        disabled={!isPicked && required > 1 && picks.length >= required}
                                        onClick={() => {
                                            toggle(entry.id);
                                        }}
                                    >
                                        {isPicked ? (
                                            <>
                                                <Check />
                                                {required === 1 ? "Selected" : `Ranked #${position + 1}`}
                                            </>
                                        ) : required === 1 ? (
                                            "Select"
                                        ) : (
                                            "Add to ranking"
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        </li>
                    );
                })}
            </ul>
            <div className="bg-background/95 sticky bottom-0 flex items-center justify-between gap-3 border-t py-3">
                <span className="text-muted-foreground text-xs">
                    {picks.length}/{required} selected{savedPicks !== null && " · you have already voted"}
                </span>
                <Button
                    disabled={picks.length !== required || cast.isPending || isUnchanged}
                    onClick={() => {
                        cast.mutate(picks);
                    }}
                >
                    {savedPicks === null ? "Cast vote" : "Update vote"}
                </Button>
            </div>
        </div>
    );
}

export function BallotPanel({ round }: { readonly round: RoundDetailDto }): ReactNode {
    const { user, isLoading } = useSession();
    const entries = useApprovedEntries(round.id);
    const ballot = useQuery({
        queryKey: queryKeys.myBallot(round.id),
        queryFn: () => fetchMyBallot(round.id),
        enabled: user !== null
    });

    if (!round.isAcceptingVotes) {
        return <EmptyState title="Voting is closed">This round opens {formatDateTime(round.opensAt)}.</EmptyState>;
    }
    if (isLoading) {
        return <LoadingRows />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in with Discord to vote." />;
    }
    if (user.isBlacklisted) {
        return (
            <Alert variant="destructive">
                <AlertDescription>Your account is blacklisted from voting.</AlertDescription>
            </Alert>
        );
    }
    if (!user.isVerified && !hasAtLeast(user, Role.Voter)) {
        return (
            <EmptyState title="Verify to vote">
                <span className="block">Verify your email once to vote in every round.</span>
                <Button asChild size="sm" className="mt-3">
                    <Link href="/verify">Verify</Link>
                </Button>
            </EmptyState>
        );
    }
    if (entries.isPending || ballot.isPending) {
        return <LoadingRows rows={4} />;
    }
    if (entries.isError) {
        return <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />;
    }
    if (ballot.isError) {
        return <ErrorState error={ballot.error} onRetry={() => void ballot.refetch()} />;
    }
    const eligible = entries.data.filter(isEligible);
    if (eligible.length < requiredPicks[round.pollType] || (round.pollType === PollType.Binary && eligible.length < 2)) {
        return <EmptyState title="Not enough entries yet">Voting starts once enough entries are approved.</EmptyState>;
    }
    return <BallotEditor key={ballot.data?.join(",") ?? "new"} round={round} entries={eligible} savedPicks={ballot.data} />;
}
