"use client";

import { deliverableContentTypes, DeliverableKind, fieldRules, problemOf, type ShotDetailDto, textLimits } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type SubmitEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { uploadToStorage } from "@/Api/Uploads";
import { FilePicker } from "@/Components/Common/FilePicker";
import { RichTextInputField } from "@/Components/Common/FormField";
import { Button } from "@/Components/Ui/button";
import { Label } from "@/Components/Ui/label";
import { Progress } from "@/Components/Ui/progress";

const blendContentType = "application/octet-stream";

interface WorkDraft {
    readonly video: File | null;
    readonly blend: File | null;
    readonly notes: string;
}

function videoProblem(video: File | null): string | null {
    return video !== null && !deliverableContentTypes[DeliverableKind.Video].includes(video.type)
        ? "The video must be MP4, WebM or MOV."
        : null;
}

function blendProblem(blend: File | null): string | null {
    if (blend === null) {
        return "Attach the .blend project file.";
    }
    return !blend.name.toLowerCase().endsWith(".blend") ? "The project file must be a .blend file." : null;
}

function validate(draft: WorkDraft): string | null {
    if (draft.video === null) {
        return "Attach the rendered video.";
    }
    if (draft.blend === null) {
        return "Attach the .blend project file.";
    }
    return videoProblem(draft.video) ?? blendProblem(draft.blend) ?? problemOf(fieldRules.workNotes, draft.notes);
}

export function SubmitWorkForm({ shot, onSubmitted }: { readonly shot: ShotDetailDto; readonly onSubmitted: () => void }): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<WorkDraft>({ video: null, blend: null, notes: "" });
    const [progress, setProgress] = useState<{ readonly label: string; readonly value: number } | null>(null);

    const submit = useMutation({
        mutationFn: async (input: WorkDraft) => {
            if (input.video === null) {
                throw new Error("Missing video.");
            }
            const videoUpload = await platformApi.requestDeliverableUpload(shot.id, {
                kind: DeliverableKind.Video,
                fileName: input.video.name,
                contentType: input.video.type,
                sizeBytes: input.video.size
            });
            await uploadToStorage(videoUpload, input.video, (value) => {
                setProgress({ label: "Uploading video", value });
            });
            if (input.blend === null) {
                throw new Error("Missing project file (.blend).");
            }
            const blendUpload = await platformApi.requestDeliverableUpload(shot.id, {
                kind: DeliverableKind.Blend,
                fileName: input.blend.name,
                contentType: blendContentType,
                sizeBytes: input.blend.size
            });
            await uploadToStorage(blendUpload, input.blend, (value) => {
                setProgress({ label: "Uploading project file", value });
            });
            const notes = input.notes.trim();
            return platformApi.submitWork(shot.id, {
                videoKey: videoUpload.key,
                blendKey: blendUpload.key,
                notes: notes.length === 0 ? null : notes
            });
        },
        onSuccess: (submission) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shot(shot.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(`Version ${submission.version} submitted for review.`);
            setDraft({ video: null, blend: null, notes: "" });
            onSubmitted();
        },
        onError: (error) => {
            toast.error(describeError(error));
        },
        onSettled: () => {
            setProgress(null);
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
        <form onSubmit={onSubmit} className="space-y-4 border p-4">
            <p className="text-sm font-medium">Submit your work</p>
            <div className="space-y-2">
                <Label htmlFor={`${formId}-video`}>Rendered video</Label>
                <FilePicker
                    id={`${formId}-video`}
                    file={draft.video}
                    required
                    accept={deliverableContentTypes[DeliverableKind.Video].join(",")}
                    disabled={submit.isPending}
                    invalid={videoProblem(draft.video) !== null}
                    onChange={(video) => {
                        setDraft((current) => ({ ...current, video }));
                    }}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor={`${formId}-blend`}>Project file (.blend)</Label>
                <FilePicker
                    id={`${formId}-blend`}
                    file={draft.blend}
                    required
                    accept=".blend"
                    disabled={submit.isPending}
                    invalid={draft.blend !== null && blendProblem(draft.blend) !== null}
                    onChange={(blend) => {
                        setDraft((current) => ({ ...current, blend }));
                    }}
                />
            </div>
            <RichTextInputField
                id={`${formId}-notes`}
                label="Notes for the reviewer (optional)"
                value={draft.notes}
                rule={fieldRules.workNotes}
                limit={textLimits.workNotes}
                disabled={submit.isPending}
                onValueChange={(notes) => {
                    setDraft((current) => ({ ...current, notes }));
                }}
            />
            {progress !== null && (
                <div className="space-y-1">
                    <p className="text-muted-foreground text-xs">{progress.label}…</p>
                    <Progress value={progress.value * 100} aria-label={progress.label} />
                </div>
            )}
            {problem !== null && (draft.video !== null || draft.blend !== null) && <p className="text-destructive text-xs">{problem}</p>}
            <Button type="submit" disabled={problem !== null || submit.isPending}>
                {submit.isPending ? "Submitting…" : "Submit for review"}
            </Button>
        </form>
    );
}
