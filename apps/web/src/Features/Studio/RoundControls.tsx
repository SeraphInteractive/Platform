"use client";

import {
    fieldRules,
    MediaContentType,
    PollType,
    problemOf,
    Role,
    RoundStatus,
    textLimits,
    validateRoundWindow,
    type RoundDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useEffect, useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { platformApi, type BinaryChoiceInput, type CreateRoundInput, type UpdateRoundInput } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { uploadToStorage } from "@/Api/Uploads";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { FilePicker } from "@/Components/Common/FilePicker";
import { RichTextInputField, TextInputField } from "@/Components/Common/FormField";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { useSession } from "@/Hooks/UseSession";
import { fromLocalInputValue, pollTypeLabels, roundStatusLabels, toLocalInputValue } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { RoundStatusBadge } from "@/Components/Common/StatusBadge";

const acceptedMediaTypes: readonly string[] = Object.values(MediaContentType);

function fileProblem(file: File | null): string | null {
    return file !== null && !acceptedMediaTypes.includes(file.type)
        ? "Media must be a PNG, JPEG, GIF or WebP image, or an MP4, WebM or MOV video."
        : null;
}

interface ChoiceDraft {
    readonly id?: string;
    readonly title: string;
    readonly description: string;
    readonly file: File | null;
    readonly existingMediaUrl?: string | null;
    readonly mediaKey?: string | null;
}

interface RoundFormDialogProps {
    readonly round?: RoundDto;
    readonly trigger: ReactNode;
}

export function RoundFormDialog({ round, trigger }: RoundFormDialogProps): ReactNode {
    const { user } = useSession();
    const canCreateBinary = hasAtLeast(user, Role.Supervisor);
    const formId = useId();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState(round?.title ?? "");
    const [pollType, setPollType] = useState<PollType>(round?.pollType ?? PollType.RankedChoice);
    const [opensAt, setOpensAt] = useState(toLocalInputValue(round?.opensAt ?? null));
    const [closesAt, setClosesAt] = useState(toLocalInputValue(round?.closesAt ?? null));
    const [choiceA, setChoiceA] = useState<ChoiceDraft>({ title: "", description: "", file: null });
    const [choiceB, setChoiceB] = useState<ChoiceDraft>({ title: "", description: "", file: null });

    const existingEntries = useQuery({
        queryKey: queryKeys.entriesAll(round?.id ?? ""),
        queryFn: () => platformApi.entries(round?.id ?? "", { perPage: 10 }),
        enabled: round !== undefined && round.pollType === PollType.Binary && open
    });

    useEffect(() => {
        if (open) {
            setTitle(round?.title ?? "");
            setPollType(round?.pollType ?? PollType.RankedChoice);
            setOpensAt(toLocalInputValue(round?.opensAt ?? null));
            setClosesAt(toLocalInputValue(round?.closesAt ?? null));
            if (round?.pollType === PollType.Binary && existingEntries.data?.data && existingEntries.data.data.length >= 2) {
                const [first, second] = existingEntries.data.data;
                if (first) {
                    setChoiceA({
                        id: first.id,
                        title: first.title,
                        description: first.description ?? "",
                        file: null,
                        existingMediaUrl: first.mediaUrl,
                        mediaKey: null
                    });
                }
                if (second) {
                    setChoiceB({
                        id: second.id,
                        title: second.title,
                        description: second.description ?? "",
                        file: null,
                        existingMediaUrl: second.mediaUrl,
                        mediaKey: null
                    });
                }
            } else if (round === undefined) {
                setChoiceA({ title: "", description: "", file: null });
                setChoiceB({ title: "", description: "", file: null });
            }
        }
    }, [open, round, existingEntries.data]);

    const opens = fromLocalInputValue(opensAt);
    const closes = fromLocalInputValue(closesAt);
    const isDraft = round === undefined || round.status === RoundStatus.Draft;
    const canEditLockedFields = isDraft || hasAtLeast(user, Role.Admin);
    const canEditBinaryEntries = round === undefined || round.status !== RoundStatus.Finalized || hasAtLeast(user, Role.Admin);
    const scheduleProblem = validateRoundWindow(opens, closes, { isDraft: canEditLockedFields });

    const binaryProblem =
        pollType === PollType.Binary
            ? ((problemOf(fieldRules.entryTitle, choiceA.title) ? `Option A: ${problemOf(fieldRules.entryTitle, choiceA.title)}` : null) ??
              problemOf(fieldRules.entryDescription, choiceA.description) ??
              fileProblem(choiceA.file) ??
              (problemOf(fieldRules.entryTitle, choiceB.title) ? `Option B: ${problemOf(fieldRules.entryTitle, choiceB.title)}` : null) ??
              problemOf(fieldRules.entryDescription, choiceB.description) ??
              fileProblem(choiceB.file))
            : null;

    const problem = problemOf(fieldRules.roundTitle, title) ?? scheduleProblem ?? binaryProblem;

    const save = useMutation({
        mutationFn: async (): Promise<RoundDto> => {
            let binaryEntries: [BinaryChoiceInput, BinaryChoiceInput] | undefined;
            if (pollType === PollType.Binary) {
                let mediaKeyA: string | null | undefined = undefined;
                if (choiceA.file !== null) {
                    const uploadA = await platformApi.requestMediaUpload(choiceA.file.type as MediaContentType, choiceA.file.size);
                    await uploadToStorage(uploadA, choiceA.file);
                    mediaKeyA = uploadA.key;
                }
                let mediaKeyB: string | null | undefined = undefined;
                if (choiceB.file !== null) {
                    const uploadB = await platformApi.requestMediaUpload(choiceB.file.type as MediaContentType, choiceB.file.size);
                    await uploadToStorage(uploadB, choiceB.file);
                    mediaKeyB = uploadB.key;
                }
                const descA = choiceA.description.trim();
                const descB = choiceB.description.trim();
                binaryEntries = [
                    {
                        ...(choiceA.id ? { id: choiceA.id } : {}),
                        title: choiceA.title.trim(),
                        description: descA.length === 0 ? null : descA,
                        ...(mediaKeyA !== undefined ? { mediaKey: mediaKeyA } : {})
                    },
                    {
                        ...(choiceB.id ? { id: choiceB.id } : {}),
                        title: choiceB.title.trim(),
                        description: descB.length === 0 ? null : descB,
                        ...(mediaKeyB !== undefined ? { mediaKey: mediaKeyB } : {})
                    }
                ];
            }

            if (round === undefined) {
                const input: CreateRoundInput = {
                    title: title.trim(),
                    pollType,
                    opensAt: opens,
                    closesAt: closes,
                    ...(binaryEntries ? { binaryEntries } : {})
                };
                return platformApi.createRound(input);
            }
            const input: UpdateRoundInput = {
                title: title.trim(),
                opensAt: opens,
                closesAt: closes,
                ...(canEditLockedFields ? { pollType } : {}),
                ...(binaryEntries && canEditBinaryEntries ? { binaryEntries } : {})
            };
            return platformApi.updateRound(round.id, input);
        },
        onSuccess: (saved) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.roundsAll });
            void queryClient.invalidateQueries({ queryKey: queryKeys.round(saved.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.entriesAll(saved.id) });
            setOpen(false);
            if (round === undefined) {
                toast.success("Round created.");
                router.push(`/studio/rounds/${saved.id}` as Route);
            } else {
                toast.success("Round updated.");
            }
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to save round.");
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
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{round === undefined ? "New round" : "Edit round"}</DialogTitle>
                    <DialogDescription>
                        {round === undefined
                            ? "Starts as a draft."
                            : round.status === RoundStatus.Finalized
                              ? "Editing finalized round (Admin override)."
                              : "Changes are visible to voters immediately."}
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="space-y-4">
                    <TextInputField
                        id={`${formId}-title`}
                        label="Question or title"
                        value={title}
                        rule={fieldRules.roundTitle}
                        limit={textLimits.roundTitle}
                        placeholder="Which story should we make?"
                        required
                        autoComplete="off"
                        onValueChange={setTitle}
                    />
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-poll`}>Poll type</Label>
                        <Select
                            value={pollType}
                            disabled={round !== undefined && !canEditLockedFields}
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
                                {canCreateBinary && (
                                    <SelectItem value={PollType.Binary}>{pollTypeLabels[PollType.Binary]}: pick one of two</SelectItem>
                                )}
                            </SelectContent>
                        </Select>
                        {!canCreateBinary && round === undefined && (
                            <p className="text-muted-foreground text-xs">
                                Binary voting rounds can only be initiated by supervisors and administrators.
                            </p>
                        )}
                        {round !== undefined && !canEditLockedFields && (
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
                                disabled={!canEditLockedFields}
                                onChange={(event) => {
                                    setOpensAt(event.target.value);
                                }}
                            />
                            {!canEditLockedFields && (
                                <p className="text-muted-foreground text-xs">Start date is locked once a round leaves draft.</p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-closes`}>Closes (optional)</Label>
                            <Input
                                id={`${formId}-closes`}
                                type="datetime-local"
                                value={closesAt}
                                aria-invalid={scheduleProblem !== null || undefined}
                                onChange={(event) => {
                                    setClosesAt(event.target.value);
                                }}
                            />
                        </div>
                    </div>
                    {scheduleProblem !== null && <p className="text-destructive text-xs">{scheduleProblem}</p>}

                    {pollType === PollType.Binary && (
                        <div className="space-y-4 pt-3 border-t">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Binary choices (required)
                                </span>
                            </div>

                            <div className="space-y-3 rounded-lg border p-3.5 bg-muted/10">
                                <div className="text-xs font-semibold text-foreground">Choice A</div>
                                <TextInputField
                                    id={`${formId}-optA-title`}
                                    label="Title"
                                    value={choiceA.title}
                                    rule={fieldRules.entryTitle}
                                    limit={textLimits.entryTitle}
                                    placeholder="Option A title"
                                    required
                                    autoComplete="off"
                                    disabled={!canEditBinaryEntries || save.isPending}
                                    onValueChange={(t) => setChoiceA((prev) => ({ ...prev, title: t }))}
                                />
                                <RichTextInputField
                                    id={`${formId}-optA-desc`}
                                    label="Description (optional)"
                                    value={choiceA.description}
                                    rule={fieldRules.entryDescription}
                                    limit={textLimits.entryDescription}
                                    disabled={!canEditBinaryEntries || save.isPending}
                                    onValueChange={(d) => setChoiceA((prev) => ({ ...prev, description: d }))}
                                />
                                <div className="space-y-1.5">
                                    <Label htmlFor={`${formId}-optA-media`}>Media image (optional)</Label>
                                    {choiceA.existingMediaUrl && !choiceA.file && (
                                        <p className="text-muted-foreground text-xs">
                                            Current media attached. Uploading a file will replace it.
                                        </p>
                                    )}
                                    <FilePicker
                                        id={`${formId}-optA-media`}
                                        file={choiceA.file}
                                        accept={acceptedMediaTypes.join(",")}
                                        disabled={!canEditBinaryEntries || save.isPending}
                                        invalid={fileProblem(choiceA.file) !== null}
                                        onChange={(file) => setChoiceA((prev) => ({ ...prev, file }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 rounded-lg border p-3.5 bg-muted/10">
                                <div className="text-xs font-semibold text-foreground">Choice B</div>
                                <TextInputField
                                    id={`${formId}-optB-title`}
                                    label="Title"
                                    value={choiceB.title}
                                    rule={fieldRules.entryTitle}
                                    limit={textLimits.entryTitle}
                                    placeholder="Option B title"
                                    required
                                    autoComplete="off"
                                    disabled={!canEditBinaryEntries || save.isPending}
                                    onValueChange={(t) => setChoiceB((prev) => ({ ...prev, title: t }))}
                                />
                                <RichTextInputField
                                    id={`${formId}-optB-desc`}
                                    label="Description (optional)"
                                    value={choiceB.description}
                                    rule={fieldRules.entryDescription}
                                    limit={textLimits.entryDescription}
                                    disabled={!canEditBinaryEntries || save.isPending}
                                    onValueChange={(d) => setChoiceB((prev) => ({ ...prev, description: d }))}
                                />
                                <div className="space-y-1.5">
                                    <Label htmlFor={`${formId}-optB-media`}>Media image (optional)</Label>
                                    {choiceB.existingMediaUrl && !choiceB.file && (
                                        <p className="text-muted-foreground text-xs">
                                            Current media attached. Uploading a file will replace it.
                                        </p>
                                    )}
                                    <FilePicker
                                        id={`${formId}-optB-media`}
                                        file={choiceB.file}
                                        accept={acceptedMediaTypes.join(",")}
                                        disabled={!canEditBinaryEntries || save.isPending}
                                        invalid={fileProblem(choiceB.file) !== null}
                                        onChange={(file) => setChoiceB((prev) => ({ ...prev, file }))}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </form>
                <DialogFooter>
                    <Button type="submit" form={formId} disabled={problem !== null || save.isPending}>
                        {save.isPending ? "Saving…" : round === undefined ? "Create draft" : "Save changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function RoundStatusSelect({ round }: { readonly round: RoundDto }): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const isSupervisor = hasAtLeast(user, Role.Supervisor);
    const isAdmin = hasAtLeast(user, Role.Admin);

    const refresh = (): void => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.roundsAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.round(round.id) });
    };

    const update = useMutation({
        mutationFn: (status: RoundStatus) => platformApi.updateRound(round.id, { status }),
        onSuccess: (updated) => {
            refresh();
            toast.success(`"${updated.title}" is now ${roundStatusLabels[updated.status].toLowerCase()}.`);
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to update round status.");
        }
    });

    if (!isSupervisor || (round.status === RoundStatus.Finalized && !isAdmin)) {
        return <RoundStatusBadge status={round.status} />;
    }

    const allowedOptions: RoundStatus[] = isAdmin
        ? [RoundStatus.Draft, RoundStatus.Open, RoundStatus.Voting, RoundStatus.Finalized]
        : round.pollType === PollType.Binary
          ? round.status === RoundStatus.Draft
              ? [RoundStatus.Draft, RoundStatus.Voting]
              : [RoundStatus.Voting]
          : round.status === RoundStatus.Draft
            ? [RoundStatus.Draft, RoundStatus.Open]
            : round.status === RoundStatus.Open
              ? [RoundStatus.Open, RoundStatus.Voting]
              : [RoundStatus.Voting];

    return (
        <Select
            value={round.status}
            disabled={update.isPending}
            onValueChange={(val) => {
                const nextStatus = val as RoundStatus;
                if (nextStatus !== round.status) {
                    update.mutate(nextStatus);
                }
            }}
        >
            <SelectTrigger size="sm" className="h-7 w-28 text-xs font-medium">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {allowedOptions.map((st) => (
                    <SelectItem key={st} value={st}>
                        {roundStatusLabels[st]}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
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
        mutationFn: (status: RoundStatus.Open | RoundStatus.Voting) => platformApi.updateRound(round.id, { status }),
        onSuccess: (updated) => {
            refresh();
            toast.success(`"${updated.title}" is now ${roundStatusLabels[updated.status].toLowerCase()}.`);
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to update round status.");
        }
    });
    const finalize = useMutation({
        mutationFn: () => platformApi.finalizeRound(round.id),
        onSuccess: () => {
            refresh();
            toast.success(`"${round.title}" is certified.`);
        },
        onError: (err) => {
            toast.error(err instanceof Error ? err.message : "Failed to finalize round.");
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
    const isAdmin = hasAtLeast(user, Role.Admin);
    const busy = update.isPending || finalize.isPending || remove.isPending;
    const size = compact ? "xs" : "sm";

    return (
        <div className="flex flex-wrap justify-end gap-1.5">
            {(round.status !== RoundStatus.Finalized || isAdmin) && (
                <RoundFormDialog
                    round={round}
                    trigger={
                        <Button size={size} variant="outline" disabled={busy}>
                            <Pencil />
                            Edit
                        </Button>
                    }
                />
            )}
            {round.status === RoundStatus.Draft && round.pollType === PollType.Binary && (
                <ConfirmButton
                    title={`Start voting for "${round.title}"?`}
                    description="Voters can begin casting ballots for the two options immediately."
                    confirmLabel="Start Voting"
                    size={size}
                    variant={compact ? "outline" : "default"}
                    disabled={busy}
                    onConfirm={() => {
                        update.mutate(RoundStatus.Voting);
                    }}
                >
                    Start Voting
                </ConfirmButton>
            )}
            {round.status === RoundStatus.Draft && round.pollType !== PollType.Binary && (
                <ConfirmButton
                    title={`Open "${round.title}" for submissions?`}
                    description="Community members can begin submitting proposal entries."
                    confirmLabel="Open Submissions"
                    size={size}
                    variant={compact ? "outline" : "default"}
                    disabled={busy}
                    onConfirm={() => {
                        update.mutate(RoundStatus.Open);
                    }}
                >
                    Open Submissions
                </ConfirmButton>
            )}
            {round.status === RoundStatus.Open && (
                <ConfirmButton
                    title={`Publish finalists & start voting for "${round.title}"?`}
                    description="Entry submissions will close and community ballot voting will begin for approved entries."
                    confirmLabel="Start Voting"
                    size={size}
                    variant={compact ? "outline" : "default"}
                    disabled={busy}
                    onConfirm={() => {
                        update.mutate(RoundStatus.Voting);
                    }}
                >
                    Start Voting
                </ConfirmButton>
            )}
            {round.status === RoundStatus.Voting && (
                <ConfirmButton
                    title={`Finalize and certify "${round.title}"?`}
                    description="Voting will close permanently and certified standings will be recorded."
                    confirmLabel="Finalize"
                    requireCheckbox={true}
                    checkboxLabel="I confirm that I want to finalize and certify this round. This action cannot be undone."
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
            {(round.status !== RoundStatus.Finalized || isAdmin) && (
                <ConfirmButton
                    title={`Delete "${round.title}"?`}
                    description={
                        round.status === RoundStatus.Finalized
                            ? "This will delete the finalized round, certified results, all entries and ballots."
                            : "Deletes the round, its entries and ballots."
                    }
                    confirmLabel="Delete round"
                    requireCheckbox={round.status === RoundStatus.Finalized}
                    checkboxLabel={
                        round.status === RoundStatus.Finalized
                            ? "I confirm that I want to delete this finalized round and all certified results."
                            : undefined
                    }
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
