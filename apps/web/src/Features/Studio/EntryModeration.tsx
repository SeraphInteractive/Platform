"use client";

import { EntryStatus, fieldRules, problemOf, Role, textLimits, type EntryDto } from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { EntryStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { RichTextInputField, TextInputField } from "@/Components/Common/FormField";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { Button } from "@/Components/Ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/Components/Ui/card";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { EntryMedia } from "@/Features/Voting/EntryMedia";
import { useSession } from "@/Hooks/UseSession";
import { entryStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { cn } from "@/Lib/Utils";

function EditEntryDialog({ roundId, entry }: { readonly roundId: string; readonly entry: EntryDto }): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(entry.title);
    const [description, setDescription] = useState(entry.description ?? "");
    const problem = problemOf(fieldRules.entryTitle, title) ?? problemOf(fieldRules.entryDescription, description);
    const save = useMutation({
        mutationFn: () => {
            const trimmed = description.trim();
            return platformApi.updateEntry(roundId, entry.id, { title: title.trim(), description: trimmed.length === 0 ? null : trimmed });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.round(roundId) });
            toast.success("Entry updated.");
            setOpen(false);
        }
    });
    const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (problem === null && !save.isPending) {
            save.mutate();
        }
    };
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="xs" variant="ghost">
                    Edit
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit entry</DialogTitle>
                    <DialogDescription>Visible to voters immediately.</DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="space-y-4">
                    <TextInputField
                        id={`${formId}-title`}
                        label="Title"
                        value={title}
                        rule={fieldRules.entryTitle}
                        limit={textLimits.entryTitle}
                        required
                        autoComplete="off"
                        disabled={save.isPending}
                        onValueChange={setTitle}
                    />
                    <RichTextInputField
                        id={`${formId}-description`}
                        label="Description"
                        value={description}
                        rule={fieldRules.entryDescription}
                        limit={textLimits.entryDescription}
                        disabled={save.isPending}
                        onValueChange={setDescription}
                    />
                </form>
                <DialogFooter>
                    <Button type="submit" form={formId} disabled={problem !== null || save.isPending}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ExamineEntryDialog({
    roundId,
    entry,
    trigger
}: {
    readonly roundId: string;
    readonly entry: EntryDto;
    readonly trigger?: ReactNode;
}): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.round(roundId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.entriesAll(roundId) });
    };
    const review = useMutation({
        mutationFn: (status: EntryStatus) => platformApi.reviewEntry(roundId, entry.id, status),
        onSuccess: (updated) => {
            refresh();
            toast.success(`"${updated.title}": ${entryStatusLabels[updated.status].toLowerCase()}.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const reinstate = useMutation({
        mutationFn: () => platformApi.reinstateEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" is back on the ballot.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const remove = useMutation({
        mutationFn: () => platformApi.deleteEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" deleted.`);
            setOpen(false);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const canReview = hasAtLeast(user, Role.Supervisor);
    const isAdmin = hasAtLeast(user, Role.Admin);
    const busy = review.isPending || reinstate.isPending || remove.isPending;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button size="xs" variant="secondary">
                        Examine
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <div className="flex flex-wrap items-center gap-2">
                        <EntryStatusBadge status={entry.status} />
                        {entry.isQuarantined && <ToneBadge tone={Tone.Negative}>Quarantined</ToneBadge>}
                        <span className="text-muted-foreground ml-auto font-mono text-xs">ID: {entry.id.slice(0, 8)}</span>
                    </div>
                    <DialogTitle className="text-base font-semibold leading-snug">{entry.title}</DialogTitle>
                    <DialogDescription className="text-xs">
                        Submitted <RelativeTime value={entry.createdAt} />
                        {entry.submittedBy !== null && ` · Submitter: ${entry.submittedBy.slice(0, 8)}`}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <EntryMedia url={entry.mediaUrl} title={entry.title} />
                    {entry.description !== null && entry.description.trim().length > 0 && (
                        <div className="bg-muted/20 rounded-md border p-3">
                            <MarkdownText className="text-sm">{entry.description}</MarkdownText>
                        </div>
                    )}
                </div>
                <DialogFooter className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <div className="flex gap-2">
                        {isAdmin && (
                            <ConfirmButton
                                title={`Delete "${entry.title}"?`}
                                description="Only possible for entries without votes."
                                confirmLabel="Delete entry"
                                destructive
                                size="xs"
                                variant="ghost"
                                disabled={busy}
                                onConfirm={() => {
                                    remove.mutate();
                                }}
                            >
                                Delete
                            </ConfirmButton>
                        )}
                        {isAdmin && entry.isQuarantined && (
                            <ConfirmButton
                                title="Lift quarantine?"
                                description="The entry returns to the ballot."
                                confirmLabel="Reinstate"
                                size="xs"
                                disabled={busy}
                                onConfirm={() => {
                                    reinstate.mutate();
                                }}
                            >
                                Reinstate
                            </ConfirmButton>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {canReview && entry.status !== EntryStatus.Rejected && (
                            <Button
                                size="xs"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    review.mutate(EntryStatus.Rejected);
                                }}
                            >
                                Reject
                            </Button>
                        )}
                        {canReview && entry.status !== EntryStatus.Approved && (
                            <Button
                                size="xs"
                                disabled={busy}
                                onClick={() => {
                                    review.mutate(EntryStatus.Approved);
                                }}
                            >
                                Approve
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EntryCard({
    roundId,
    entry,
    selected = false,
    onToggleSelect
}: {
    readonly roundId: string;
    readonly entry: EntryDto;
    readonly selected?: boolean;
    readonly onToggleSelect?: (id: string) => void;
}): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.round(roundId) });
    };
    const review = useMutation({
        mutationFn: (status: EntryStatus) => platformApi.reviewEntry(roundId, entry.id, status),
        onSuccess: (updated) => {
            refresh();
            toast.success(`"${updated.title}": ${entryStatusLabels[updated.status].toLowerCase()}.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const reinstate = useMutation({
        mutationFn: () => platformApi.reinstateEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" is back on the ballot.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const remove = useMutation({
        mutationFn: () => platformApi.deleteEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" deleted.`);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    const busy = review.isPending || reinstate.isPending || remove.isPending;
    const canReview = hasAtLeast(user, Role.Supervisor);
    const isAdmin = hasAtLeast(user, Role.Admin);

    return (
        <Card className={cn("h-full transition-colors", selected && "border-primary/60 bg-primary/[0.02]")}>
            <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {onToggleSelect !== undefined && (
                        <Checkbox
                            checked={selected}
                            onCheckedChange={() => {
                                onToggleSelect(entry.id);
                            }}
                            aria-label={`Select ${entry.title}`}
                        />
                    )}
                    <EntryStatusBadge status={entry.status} />
                    {entry.isQuarantined && <ToneBadge tone={Tone.Negative}>Quarantined</ToneBadge>}
                    <span className="text-muted-foreground ml-auto text-xs">
                        <RelativeTime value={entry.createdAt} />
                    </span>
                </div>
                <CardTitle className="text-sm leading-snug">{entry.title}</CardTitle>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
                {entry.description !== null && <MarkdownText className="text-muted-foreground text-sm">{entry.description}</MarkdownText>}
                <EntryMedia url={entry.mediaUrl} title={entry.title} />
                <div className="flex flex-wrap gap-1.5">
                    <ExamineEntryDialog roundId={roundId} entry={entry} />
                    {canReview && entry.status !== EntryStatus.Approved && (
                        <Button
                            size="xs"
                            disabled={busy}
                            onClick={() => {
                                review.mutate(EntryStatus.Approved);
                            }}
                        >
                            Approve
                        </Button>
                    )}
                    {canReview && entry.status !== EntryStatus.Rejected && (
                        <Button
                            size="xs"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                                review.mutate(EntryStatus.Rejected);
                            }}
                        >
                            Reject
                        </Button>
                    )}
                    {isAdmin && entry.isQuarantined && (
                        <ConfirmButton
                            title="Lift the quarantine?"
                            description="The entry returns to the ballot and its votes count again."
                            confirmLabel="Reinstate"
                            size="xs"
                            disabled={busy}
                            onConfirm={() => {
                                reinstate.mutate();
                            }}
                        >
                            Reinstate
                        </ConfirmButton>
                    )}
                    {isAdmin && <EditEntryDialog key={entry.updatedAt} roundId={roundId} entry={entry} />}
                    {isAdmin && (
                        <ConfirmButton
                            title={`Delete "${entry.title}"?`}
                            description="Only possible for entries without votes."
                            confirmLabel="Delete entry"
                            destructive
                            size="xs"
                            variant="ghost"
                            disabled={busy}
                            onConfirm={() => {
                                remove.mutate();
                            }}
                        >
                            Delete
                        </ConfirmButton>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export function EntryModeration({ roundId }: { readonly roundId: string }): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<EntryStatus>(EntryStatus.PendingReview);
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkOperating, setIsBulkOperating] = useState(false);

    const query = { status, page, perPage: 20 };
    const entries = useQuery({
        queryKey: queryKeys.entries(roundId, query),
        queryFn: () => platformApi.entries(roundId, query),
        placeholderData: keepPreviousData
    });

    const canReview = hasAtLeast(user, Role.Supervisor);
    const isAdmin = hasAtLeast(user, Role.Admin);

    const handleTabChange = (value: string): void => {
        setStatus(value as EntryStatus);
        setPage(1);
        setSelectedIds(new Set());
    };

    const handlePageChange = (nextPage: number): void => {
        setPage(nextPage);
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string): void => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const pageEntries = entries.data?.data ?? [];
    const allOnPageSelected = pageEntries.length > 0 && pageEntries.every((e) => selectedIds.has(e.id));
    const someOnPageSelected = pageEntries.some((e) => selectedIds.has(e.id));

    const toggleSelectAll = (): void => {
        if (allOnPageSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const e of pageEntries) {
                    next.delete(e.id);
                }
                return next;
            });
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                for (const e of pageEntries) {
                    next.add(e.id);
                }
                return next;
            });
        }
    };

    const refreshAll = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.round(roundId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.entriesAll(roundId) });
    };

    const handleBulkReject = async (): Promise<void> => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) {
            return;
        }
        setIsBulkOperating(true);
        try {
            const results = await Promise.allSettled(ids.map((id) => platformApi.reviewEntry(roundId, id, EntryStatus.Rejected)));
            const succeeded = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.filter((r) => r.status === "rejected").length;
            refreshAll();
            if (failed === 0) {
                toast.success(`Rejected ${succeeded} ${succeeded === 1 ? "entry" : "entries"}.`);
            } else {
                toast.warning(`Rejected ${succeeded} entries (${failed} failed).`);
            }
            setSelectedIds(new Set());
        } finally {
            setIsBulkOperating(false);
        }
    };

    const handleBulkDelete = async (): Promise<void> => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) {
            return;
        }
        setIsBulkOperating(true);
        try {
            const results = await Promise.allSettled(ids.map((id) => platformApi.deleteEntry(roundId, id)));
            const succeeded = results.filter((r) => r.status === "fulfilled").length;
            const failed = results.filter((r) => r.status === "rejected").length;
            refreshAll();
            if (failed === 0) {
                toast.success(`Deleted ${succeeded} ${succeeded === 1 ? "entry" : "entries"}.`);
            } else {
                toast.warning(`Deleted ${succeeded} entries (${failed} failed, entries with votes cannot be deleted).`);
            }
            setSelectedIds(new Set());
        } finally {
            setIsBulkOperating(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs value={status} onValueChange={handleTabChange}>
                    <TabsList>
                        {Object.values(EntryStatus).map((item) => (
                            <TabsTrigger key={item} value={item}>
                                {entryStatusLabels[item]}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
                {pageEntries.length > 0 && (canReview || isAdmin) && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs">
                            <Checkbox
                                id="select-all-entries"
                                checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                                onCheckedChange={toggleSelectAll}
                                disabled={isBulkOperating}
                            />
                            <label htmlFor="select-all-entries" className="cursor-pointer select-none font-medium">
                                Select all
                            </label>
                            {selectedIds.size > 0 && <span className="text-muted-foreground ml-1 font-mono">({selectedIds.size})</span>}
                        </div>
                        {selectedIds.size > 0 && (
                            <>
                                {canReview && status !== EntryStatus.Rejected && (
                                    <ConfirmButton
                                        title={`Reject ${selectedIds.size} ${selectedIds.size === 1 ? "entry" : "entries"}?`}
                                        description="They will be moved to the rejected tab."
                                        confirmLabel={`Reject (${selectedIds.size})`}
                                        size="xs"
                                        variant="outline"
                                        disabled={isBulkOperating}
                                        onConfirm={handleBulkReject}
                                    >
                                        Reject ({selectedIds.size})
                                    </ConfirmButton>
                                )}
                                {isAdmin && (
                                    <ConfirmButton
                                        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "entry" : "entries"}?`}
                                        description="Entries without votes will be permanently deleted."
                                        confirmLabel={`Delete (${selectedIds.size})`}
                                        destructive
                                        size="xs"
                                        variant="ghost"
                                        disabled={isBulkOperating}
                                        onConfirm={handleBulkDelete}
                                    >
                                        Delete ({selectedIds.size})
                                    </ConfirmButton>
                                )}
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    disabled={isBulkOperating}
                                    onClick={() => {
                                        setSelectedIds(new Set());
                                    }}
                                >
                                    Clear
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>
            {entries.isPending ? (
                <LoadingRows rows={4} />
            ) : entries.isError ? (
                <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />
            ) : entries.data.data.length === 0 ? (
                <EmptyState title={`No ${entryStatusLabels[status].toLowerCase()} entries`} />
            ) : (
                <>
                    <ul className="grid gap-4 md:grid-cols-2">
                        {entries.data.data.map((entry) => (
                            <li key={entry.id}>
                                <EntryCard
                                    roundId={roundId}
                                    entry={entry}
                                    selected={selectedIds.has(entry.id)}
                                    onToggleSelect={canReview || isAdmin ? toggleSelect : undefined}
                                />
                            </li>
                        ))}
                    </ul>
                    <Pagination meta={entries.data.meta} onPageChange={handlePageChange} />
                </>
            )}
        </div>
    );
}
