"use client";

import { PollType, Role, RoundStatus, type RoundDto } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { platformApi, type CreateRoundInput, type UpdateRoundInput } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { useSession } from "@/Hooks/UseSession";
import { fromLocalInputValue, pollTypeLabels, roundStatusLabels, toLocalInputValue } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";

interface RoundFormDialogProps {
    readonly round?: RoundDto;
    readonly trigger: ReactNode;
}

export function RoundFormDialog({ round, trigger }: RoundFormDialogProps): ReactNode {
    const formId = useId();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(round?.title ?? "");
    const [pollType, setPollType] = useState<PollType>(round?.pollType ?? PollType.RankedChoice);
    const [opensAt, setOpensAt] = useState(toLocalInputValue(round?.opensAt ?? null));
    const [closesAt, setClosesAt] = useState(toLocalInputValue(round?.closesAt ?? null));

    const opens = fromLocalInputValue(opensAt);
    const closes = fromLocalInputValue(closesAt);
    const problem =
        title.trim().length === 0
            ? "Give the round a title."
            : opens !== null && closes !== null && closes <= opens
              ? "The round has to close after it opens."
              : null;

    const save = useMutation({
        mutationFn: (): Promise<RoundDto> => {
            if (round === undefined) {
                const input: CreateRoundInput = { title: title.trim(), pollType, opensAt: opens, closesAt: closes };
                return platformApi.createRound(input);
            }
            const input: UpdateRoundInput = {
                title: title.trim(),
                opensAt: opens,
                closesAt: closes,
                ...(round.status === RoundStatus.Draft ? { pollType } : {})
            };
            return platformApi.updateRound(round.id, input);
        },
        onSuccess: (saved) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.roundsAll });
            void queryClient.invalidateQueries({ queryKey: queryKeys.round(saved.id) });
            setOpen(false);
            if (round === undefined) {
                toast.success("Round created.");
                router.push(`/studio/rounds/${saved.id}` as Route);
            } else {
                toast.success("Round updated.");
            }
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
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{round === undefined ? "New round" : "Edit round"}</DialogTitle>
                    <DialogDescription>
                        {round === undefined ? "Starts as a draft." : "Changes are visible to voters immediately."}
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-title`}>Question or title</Label>
                        <Input
                            id={`${formId}-title`}
                            value={title}
                            maxLength={255}
                            placeholder="Which story should we make?"
                            onChange={(event) => {
                                setTitle(event.target.value);
                            }}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-poll`}>Poll type</Label>
                        <Select
                            value={pollType}
                            disabled={round !== undefined && round.status !== RoundStatus.Draft}
                            onValueChange={(value) => {
                                setPollType(value as PollType);
                            }}
                        >
                            <SelectTrigger id={`${formId}-poll`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={PollType.RankedChoice}>
                                    {pollTypeLabels[PollType.RankedChoice]}: rank top three
                                </SelectItem>
                                <SelectItem value={PollType.Binary}>{pollTypeLabels[PollType.Binary]}: pick one of two</SelectItem>
                            </SelectContent>
                        </Select>
                        {round !== undefined && round.status !== RoundStatus.Draft && (
                            <p className="text-muted-foreground text-xs">The poll type is locked once a round leaves draft.</p>
                        )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-opens`}>Opens (optional)</Label>
                            <Input
                                id={`${formId}-opens`}
                                type="datetime-local"
                                value={opensAt}
                                onChange={(event) => {
                                    setOpensAt(event.target.value);
                                }}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-closes`}>Closes (optional)</Label>
                            <Input
                                id={`${formId}-closes`}
                                type="datetime-local"
                                value={closesAt}
                                onChange={(event) => {
                                    setClosesAt(event.target.value);
                                }}
                            />
                        </div>
                    </div>
                    {problem !== null && title.length > 0 && <p className="text-destructive text-xs">{problem}</p>}
                </form>
                <DialogFooter>
                    <Button type="submit" form={formId} disabled={problem !== null || save.isPending}>
                        {round === undefined ? "Create draft" : "Save changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function RoundActions({ round, compact = false }: { readonly round: RoundDto; readonly compact?: boolean }): ReactNode {
    const router = useRouter();
    const { user } = useSession();
    const queryClient = useQueryClient();
    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.roundsAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.round(round.id) });
    };
    const update = useMutation({
        mutationFn: (status: RoundStatus.Open | RoundStatus.Closed) => platformApi.updateRound(round.id, { status }),
        onSuccess: (updated) => {
            refresh();
            toast.success(`"${updated.title}" is now ${roundStatusLabels[updated.status].toLowerCase()}.`);
        }
    });
    const finalize = useMutation({
        mutationFn: () => platformApi.finalizeRound(round.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${round.title}" is certified.`);
        }
    });
    const remove = useMutation({
        mutationFn: () => platformApi.deleteRound(round.id),
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: queryKeys.round(round.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.roundsAll });
            toast.success(`"${round.title}" deleted.`);
            router.push("/studio/rounds");
        }
    });
    if (!hasAtLeast(user, Role.Supervisor)) {
        return null;
    }
    const busy = update.isPending || finalize.isPending || remove.isPending;
    const size = compact ? "xs" : "sm";

    return (
        <div className="flex flex-wrap justify-end gap-1.5">
            {(round.status === RoundStatus.Draft || round.status === RoundStatus.Closed) && (
                <ConfirmButton
                    title={round.status === RoundStatus.Draft ? `Open "${round.title}" for voting?` : `Reopen "${round.title}"?`}
                    description="Voting starts now and is announced on Discord."
                    confirmLabel="Open voting"
                    size={size}
                    variant={compact ? "outline" : "default"}
                    disabled={busy}
                    onConfirm={() => {
                        update.mutate(RoundStatus.Open);
                    }}
                >
                    {round.status === RoundStatus.Draft ? "Open" : "Reopen"}
                </ConfirmButton>
            )}
            {round.status === RoundStatus.Open && (
                <ConfirmButton
                    title={`Close "${round.title}"?`}
                    description="Voting stops. You can reopen it later."
                    confirmLabel="Close voting"
                    size={size}
                    disabled={busy}
                    onConfirm={() => {
                        update.mutate(RoundStatus.Closed);
                    }}
                >
                    Close
                </ConfirmButton>
            )}
            {round.status === RoundStatus.Closed && (
                <ConfirmButton
                    title={`Certify "${round.title}"?`}
                    description="The result becomes permanent and is announced on Discord."
                    confirmLabel="Certify result"
                    size={size}
                    variant={compact ? "outline" : "default"}
                    disabled={busy}
                    onConfirm={() => {
                        finalize.mutate();
                    }}
                >
                    Finalize
                </ConfirmButton>
            )}
            {round.status !== RoundStatus.Finalized && (
                <ConfirmButton
                    title={`Delete "${round.title}"?`}
                    description="Deletes the round, its entries and ballots."
                    confirmLabel="Delete round"
                    destructive
                    size={size}
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
    );
}
