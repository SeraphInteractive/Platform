"use client";

import { EntryStatus, fieldRules, problemOf, Role, textLimits, type EntryDto } from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { EntryMedia } from "@/Features/Voting/EntryMedia";
import { useSession } from "@/Hooks/UseSession";
import { entryStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";

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

function EntryCard({ roundId, entry }: { readonly roundId: string; readonly entry: EntryDto }): ReactNode {
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
        }
    });
    const reinstate = useMutation({
        mutationFn: () => platformApi.reinstateEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" is back on the ballot.`);
        }
    });
    const remove = useMutation({
        mutationFn: () => platformApi.deleteEntry(roundId, entry.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${entry.title}" deleted.`);
        }
    });
    const busy = review.isPending || reinstate.isPending || remove.isPending;
    const canReview = hasAtLeast(user, Role.Supervisor);
    const isAdmin = hasAtLeast(user, Role.Admin);

    return (
        <Card className="h-full">
            <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
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
    const [status, setStatus] = useState<EntryStatus>(EntryStatus.PendingReview);
    const [page, setPage] = useState(1);
    const query = { status, page, perPage: 20 };
    const entries = useQuery({
        queryKey: queryKeys.entries(roundId, query),
        queryFn: () => platformApi.entries(roundId, query),
        placeholderData: keepPreviousData
    });

    return (
        <div className="space-y-4">
            <Tabs
                value={status}
                onValueChange={(value) => {
                    setStatus(value as EntryStatus);
                    setPage(1);
                }}
            >
                <TabsList>
                    {Object.values(EntryStatus).map((item) => (
                        <TabsTrigger key={item} value={item}>
                            {entryStatusLabels[item]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
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
                                <EntryCard roundId={roundId} entry={entry} />
                            </li>
                        ))}
                    </ul>
                    <Pagination meta={entries.data.meta} onPageChange={setPage} />
                </>
            )}
        </div>
    );
}
