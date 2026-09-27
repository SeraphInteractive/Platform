"use client";

import { EntryStatus, fieldRules, MediaContentType, problemOf, textLimits, type RoundDetailDto } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState, type SubmitEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { uploadToStorage } from "@/Api/Uploads";
import { FilePicker } from "@/Components/Common/FilePicker";
import { RichTextInputField, TextInputField } from "@/Components/Common/FormField";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Label } from "@/Components/Ui/label";
import { Progress } from "@/Components/Ui/progress";

const acceptedMediaTypes: readonly string[] = Object.values(MediaContentType);

interface EntryDraft {
    readonly title: string;
    readonly description: string;
    readonly file: File | null;
}

function fileProblem(file: File | null): string | null {
    return file !== null && !acceptedMediaTypes.includes(file.type)
        ? "Media must be a PNG, JPEG, GIF or WebP image, or an MP4, WebM or MOV video."
        : null;
}

function validate(draft: EntryDraft): string | null {
    return (
        problemOf(fieldRules.entryTitle, draft.title) ??
        problemOf(fieldRules.entryDescription, draft.description) ??
        fileProblem(draft.file)
    );
}

export function SubmitEntryDialog({ round }: { readonly round: RoundDetailDto }): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<EntryDraft>({ title: "", description: "", file: null });
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    const submit = useMutation({
        mutationFn: async (input: EntryDraft) => {
            let mediaKey: string | null = null;
            if (input.file !== null) {
                const upload = await platformApi.requestMediaUpload(input.file.type as MediaContentType, input.file.size);
                setUploadProgress(0);
                await uploadToStorage(upload, input.file, setUploadProgress);
                mediaKey = upload.key;
            }
            const description = input.description.trim();
            return platformApi.createEntry(round.id, {
                title: input.title.trim(),
                description: description.length === 0 ? null : description,
                mediaKey
            });
        },
        onSuccess: (entry) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.round(round.id) });
            toast.success(
                entry.status === EntryStatus.Approved ? "Entry added to the ballot." : "Entry submitted. A supervisor will review it."
            );
            setDraft({ title: "", description: "", file: null });
            setOpen(false);
        },
        onError: (error) => {
            toast.error(describeError(error));
        },
        onSettled: () => {
            setUploadProgress(null);
        }
    });

    const problem = validate(draft);
    const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (problem === null && !submit.isPending) {
            submit.mutate(draft);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!submit.isPending) {
                    setOpen(next);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button size="sm">
                    <Plus />
                    Propose entry
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Propose an entry</DialogTitle>
                    <DialogDescription>Entries are reviewed before they appear on the ballot.</DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="space-y-4">
                    <TextInputField
                        id={`${formId}-title`}
                        label="Title"
                        value={draft.title}
                        rule={fieldRules.entryTitle}
                        limit={textLimits.entryTitle}
                        hint="Keep it short. Put the detail in the description."
                        required
                        autoComplete="off"
                        disabled={submit.isPending}
                        onValueChange={(title) => {
                            setDraft((current) => ({ ...current, title }));
                        }}
                    />
                    <RichTextInputField
                        id={`${formId}-description`}
                        label="Description (optional)"
                        value={draft.description}
                        rule={fieldRules.entryDescription}
                        limit={textLimits.entryDescription}
                        disabled={submit.isPending}
                        onValueChange={(description) => {
                            setDraft((current) => ({ ...current, description }));
                        }}
                    />
                    <div className="space-y-2">
                        <Label htmlFor={`${formId}-media`}>Media (optional)</Label>
                        <FilePicker
                            id={`${formId}-media`}
                            file={draft.file}
                            accept={acceptedMediaTypes.join(",")}
                            disabled={submit.isPending}
                            invalid={fileProblem(draft.file) !== null}
                            onChange={(file) => {
                                setDraft((current) => ({ ...current, file }));
                            }}
                        />
                        {fileProblem(draft.file) !== null && <p className="text-destructive text-xs">{fileProblem(draft.file)}</p>}
                        {uploadProgress !== null && <Progress value={uploadProgress * 100} aria-label="Upload progress" />}
                    </div>
                </form>
                <DialogFooter>
                    <Button type="submit" form={formId} disabled={problem !== null || submit.isPending}>
                        {submit.isPending ? "Submitting…" : "Submit entry"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
