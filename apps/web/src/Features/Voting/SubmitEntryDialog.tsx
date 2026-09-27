"use client";

import { EntryStatus, MediaContentType, type RoundDetailDto } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState, type SubmitEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { uploadToStorage } from "@/Api/Uploads";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Progress } from "@/Components/Ui/progress";
import { Textarea } from "@/Components/Ui/textarea";
import { formatBytes } from "@/Lib/Format";

const maximumTitleLength = 255;
const maximumTitleWords = 30;
const maximumDescriptionLength = 250;
const acceptedMediaTypes: readonly string[] = Object.values(MediaContentType);

interface EntryDraft {
    readonly title: string;
    readonly description: string;
    readonly file: File | null;
}

function wordCount(value: string): number {
    return value
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0).length;
}

function validate(draft: EntryDraft): string | null {
    const title = draft.title.trim();
    if (title.length === 0) {
        return "Give your entry a title.";
    }
    if (title.length > maximumTitleLength || wordCount(title) > maximumTitleWords) {
        return `Keep the title under ${maximumTitleWords} words and ${maximumTitleLength} characters.`;
    }
    if (draft.description.trim().length > maximumDescriptionLength) {
        return `Keep the description under ${maximumDescriptionLength} characters.`;
    }
    if (draft.file !== null && !acceptedMediaTypes.includes(draft.file.type)) {
        return "Media must be a PNG, JPEG, GIF or WebP image, or an MP4, WebM or MOV video.";
    }
    return null;
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
                    <div className="space-y-2">
                        <Label htmlFor={`${formId}-title`}>Title</Label>
                        <Input
                            id={`${formId}-title`}
                            value={draft.title}
                            maxLength={maximumTitleLength}
                            required
                            autoComplete="off"
                            onChange={(event) => {
                                setDraft((current) => ({ ...current, title: event.target.value }));
                            }}
                        />
                        <p className="text-muted-foreground text-xs">
                            {wordCount(draft.title)}/{maximumTitleWords} words
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${formId}-description`}>Description (optional)</Label>
                        <Textarea
                            id={`${formId}-description`}
                            value={draft.description}
                            maxLength={maximumDescriptionLength}
                            rows={3}
                            onChange={(event) => {
                                setDraft((current) => ({ ...current, description: event.target.value }));
                            }}
                        />
                        <p className="text-muted-foreground text-xs">
                            {draft.description.trim().length}/{maximumDescriptionLength}
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${formId}-media`}>Media (optional)</Label>
                        <Input
                            id={`${formId}-media`}
                            type="file"
                            accept={acceptedMediaTypes.join(",")}
                            onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                setDraft((current) => ({ ...current, file }));
                            }}
                        />
                        {draft.file !== null && (
                            <p className="text-muted-foreground text-xs">
                                {draft.file.name} · {formatBytes(draft.file.size)}
                            </p>
                        )}
                        {uploadProgress !== null && <Progress value={uploadProgress * 100} aria-label="Upload progress" />}
                    </div>
                    {problem !== null && (draft.title.length > 0 || draft.file !== null) && (
                        <p className="text-destructive text-xs">{problem}</p>
                    )}
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
