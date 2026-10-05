"use client";

import {
    DifficultyTier,
    fieldRules,
    type MediaContentType,
    problemOf,
    Role,
    ShotStatus,
    textLimits,
    type ShotDto
} from "@platform/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImagePlus, MoreHorizontal, Plus, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useRef, useState, type ChangeEvent, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi, type CreateShotInput } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { uploadToStorage } from "@/Api/Uploads";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { ShotStatusBadge } from "@/Components/Common/StatusBadge";
import { discordThreadUrl, useSiteConfig } from "@/Components/SiteConfig";
import { RichTextInputField, TextInputField } from "@/Components/Common/FormField";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/Components/Ui/dropdown-menu";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Progress } from "@/Components/Ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { useSession } from "@/Hooks/UseSession";
import { difficultyLabels, shotStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";

const anyValue = "any";
const acceptedImageTypes: readonly string[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function extractMediaKey(url: string): string {
    const match = url.match(/media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|gif|webp|mp4|webm|mov)/iu);
    return match ? match[0] : url;
}

interface TaskImageItem {
    readonly id: string;
    readonly previewUrl: string;
    readonly file?: File;
    readonly mediaKey?: string;
}

interface ShotDraft {
    readonly sceneNumber: string;
    readonly shotCode: string;
    readonly title: string;
    readonly description: string;
    readonly difficultyTier: DifficultyTier;
    readonly seniorPriorityHours: string;
}

function draftOf(shot: ShotDto | undefined): ShotDraft {
    return {
        sceneNumber: shot === undefined ? "" : String(shot.sceneNumber),
        shotCode: shot?.shotCode ?? "",
        title: shot?.title ?? "",
        description: shot?.description ?? "",
        difficultyTier: shot?.difficultyTier ?? DifficultyTier.Medium,
        seniorPriorityHours: "0"
    };
}

interface ShotProblems {
    readonly sceneNumber: string | null;
    readonly shotCode: string | null;
    readonly title: string | null;
    readonly description: string | null;
    readonly seniorPriorityHours: string | null;
}

function integerProblem(value: string, minimum: number, maximum: number, label: string): string | null {
    const number = Number(value);
    return value.trim().length === 0 || !Number.isInteger(number) || number < minimum || number > maximum
        ? `${label} must be a whole number from ${minimum} to ${maximum}.`
        : null;
}

function problemsOf(draft: ShotDraft): ShotProblems {
    return {
        sceneNumber: integerProblem(draft.sceneNumber, 1, 100_000, "Scene"),
        shotCode: problemOf(fieldRules.shotCode, draft.shotCode),
        title: problemOf(fieldRules.shotTitle, draft.title),
        description: problemOf(fieldRules.shotDescription, draft.description),
        seniorPriorityHours: integerProblem(draft.seniorPriorityHours, 0, 168, "Senior priority")
    };
}

function toInput(draft: ShotDraft): CreateShotInput | null {
    if (Object.values(problemsOf(draft)).some((problem) => problem !== null)) {
        return null;
    }
    const sceneNumber = Number(draft.sceneNumber);
    const seniorPriorityHours = Number(draft.seniorPriorityHours);
    const shotCode = draft.shotCode.trim();
    const title = draft.title.trim();
    const description = draft.description.trim();
    return {
        roundId: null,
        sceneNumber,
        shotCode,
        title,
        description: description.length === 0 ? null : description,
        difficultyTier: draft.difficultyTier,
        seniorPriorityHours
    };
}

function TaskFormDialog({ shot, trigger }: { readonly shot?: ShotDto; readonly trigger: ReactNode }): ReactNode {
    const formId = useId();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<ShotDraft>(() => draftOf(shot));
    const [images, setImages] = useState<TaskImageItem[]>(
        () =>
            shot?.imageUrls.map((url, i) => ({
                id: `existing-${i}-${url}`,
                previewUrl: url,
                mediaKey: extractMediaKey(url)
            })) ?? []
    );
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);

    const input = toInput(draft);
    const problems = problemsOf(draft);

    const onOpenChange = (next: boolean): void => {
        if (save.isPending) {
            return;
        }
        setOpen(next);
        if (next) {
            setDraft(draftOf(shot));
            setImages(
                shot?.imageUrls.map((url, i) => ({
                    id: `existing-${i}-${url}`,
                    previewUrl: url,
                    mediaKey: extractMediaKey(url)
                })) ?? []
            );
        }
    };

    const handleFileSelect = (event: ChangeEvent<HTMLInputElement>): void => {
        const files = Array.from(event.target.files ?? []);
        if (files.length === 0) {
            return;
        }

        const availableSlots = 4 - images.length;
        if (availableSlots <= 0) {
            toast.error("A task can have at most 4 images.");
            return;
        }

        const validItems: TaskImageItem[] = [];
        for (const file of files.slice(0, availableSlots)) {
            if (!acceptedImageTypes.includes(file.type)) {
                toast.error(`"${file.name}" is not a supported image format.`);
                continue;
            }
            validItems.push({
                id: `new-${Date.now()}-${Math.random()}`,
                previewUrl: URL.createObjectURL(file),
                file
            });
        }

        if (validItems.length > 0) {
            setImages((current) => [...current, ...validItems]);
        }
        if (fileInputRef.current !== null) {
            fileInputRef.current.value = "";
        }
    };

    const removeImage = (id: string): void => {
        setImages((current) => {
            const item = current.find((img) => img.id === id);
            if (item?.file !== undefined) {
                URL.revokeObjectURL(item.previewUrl);
            }
            return current.filter((img) => img.id !== id);
        });
    };

    const save = useMutation({
        mutationFn: async (value: CreateShotInput): Promise<ShotDto> => {
            const resolvedKeys: string[] = [];
            const filesToUpload = images.filter((img) => img.file !== undefined);
            let uploaded = 0;

            if (filesToUpload.length > 0) {
                setUploadProgress(0);
            }

            for (const item of images) {
                if (item.mediaKey !== undefined) {
                    resolvedKeys.push(item.mediaKey);
                } else if (item.file !== undefined) {
                    const upload = await platformApi.requestMediaUpload(item.file.type as MediaContentType, item.file.size);
                    await uploadToStorage(upload, item.file, (fraction) => {
                        const overall = (uploaded + fraction) / filesToUpload.length;
                        setUploadProgress(overall);
                    });
                    uploaded++;
                    resolvedKeys.push(upload.key);
                }
            }

            const payload: CreateShotInput = {
                ...value,
                imageKeys: resolvedKeys
            };

            if (shot === undefined) {
                return platformApi.createShot(payload);
            }
            return platformApi.updateShot(shot.id, {
                sceneNumber: payload.sceneNumber,
                shotCode: payload.shotCode,
                title: payload.title,
                description: payload.description,
                difficultyTier: payload.difficultyTier,
                imageKeys: resolvedKeys
            });
        },
        onSuccess: (saved) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            void queryClient.invalidateQueries({ queryKey: queryKeys.shot(saved.id) });
            toast.success(shot === undefined ? `Created ${saved.shotCode}.` : `Saved ${saved.shotCode}.`);
            setOpen(false);
            if (shot === undefined) {
                setDraft(draftOf(undefined));
                setImages([]);
            }
        },
        onError: (error) => {
            toast.error(describeError(error));
        },
        onSettled: () => {
            setUploadProgress(null);
        }
    });

    const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (input !== null && !save.isPending) {
            save.mutate(input);
        }
    };

    const field =
        (key: keyof ShotDraft) =>
        (event: { readonly target: { readonly value: string } }): void => {
            setDraft((current) => ({ ...current, [key]: event.target.value }));
        };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{shot === undefined ? "New task" : `Edit ${shot.shotCode}`}</DialogTitle>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-scene`}>Scene</Label>
                        <Input
                            id={`${formId}-scene`}
                            type="number"
                            min={1}
                            max={100_000}
                            step={1}
                            required
                            value={draft.sceneNumber}
                            aria-invalid={(draft.sceneNumber.length > 0 && problems.sceneNumber !== null) || undefined}
                            title={problems.sceneNumber ?? undefined}
                            onChange={field("sceneNumber")}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-code`}>Code</Label>
                        <Input
                            id={`${formId}-code`}
                            maxLength={textLimits.shotCode}
                            required
                            autoComplete="off"
                            className="font-mono"
                            value={draft.shotCode}
                            aria-invalid={(draft.shotCode.length > 0 && problems.shotCode !== null) || undefined}
                            title={problems.shotCode ?? undefined}
                            onChange={field("shotCode")}
                        />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`${formId}-difficulty`}>Difficulty</Label>
                        <Select
                            value={draft.difficultyTier}
                            onValueChange={(value) => {
                                setDraft((current) => ({ ...current, difficultyTier: value as DifficultyTier }));
                            }}
                        >
                            <SelectTrigger id={`${formId}-difficulty`} className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.values(DifficultyTier).map((tier) => (
                                    <SelectItem key={tier} value={tier}>
                                        {difficultyLabels[tier]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {draft.shotCode.length > 0 && problems.shotCode !== null && (
                        <p className="text-destructive text-xs sm:col-span-4">{problems.shotCode}</p>
                    )}
                    <div className="sm:col-span-4">
                        <TextInputField
                            id={`${formId}-title`}
                            label="Title"
                            value={draft.title}
                            rule={fieldRules.shotTitle}
                            limit={textLimits.shotTitle}
                            hint="Keep it short. Put the detail in the brief."
                            required
                            autoComplete="off"
                            onValueChange={(title) => {
                                setDraft((current) => ({ ...current, title }));
                            }}
                        />
                    </div>
                    <div className="sm:col-span-4">
                        <RichTextInputField
                            id={`${formId}-description`}
                            label="Brief"
                            value={draft.description}
                            rule={fieldRules.shotDescription}
                            limit={textLimits.shotDescription}
                            onValueChange={(description) => {
                                setDraft((current) => ({ ...current, description }));
                            }}
                        />
                    </div>
                    {shot === undefined && (
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor={`${formId}-senior`}>Senior priority (hours)</Label>
                            <Input
                                id={`${formId}-senior`}
                                type="number"
                                min={0}
                                max={168}
                                step={1}
                                required
                                value={draft.seniorPriorityHours}
                                aria-invalid={problems.seniorPriorityHours !== null || undefined}
                                onChange={field("seniorPriorityHours")}
                            />
                            {problems.seniorPriorityHours !== null && (
                                <p className="text-destructive text-xs">{problems.seniorPriorityHours}</p>
                            )}
                        </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-4">
                        <div className="flex items-center justify-between">
                            <Label>Reference images</Label>
                            <span className="text-muted-foreground text-xs">{images.length}/4</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {images.map((img) => (
                                <div key={img.id} className="group relative aspect-video overflow-hidden rounded border bg-muted/40">
                                    <img src={img.previewUrl} alt="" className="size-full object-cover" />
                                    <button
                                        type="button"
                                        disabled={save.isPending}
                                        onClick={() => removeImage(img.id)}
                                        className="bg-background/80 hover:bg-destructive hover:text-destructive-foreground absolute top-1 right-1 rounded p-0.5 text-muted-foreground transition-colors"
                                        aria-label="Remove image"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                            {images.length < 4 && (
                                <button
                                    type="button"
                                    disabled={save.isPending}
                                    onClick={() => fileInputRef.current?.click()}
                                    className="hover:border-foreground/40 hover:bg-muted/30 flex aspect-video flex-col items-center justify-center gap-1 rounded border border-dashed text-xs text-muted-foreground transition-colors"
                                >
                                    <ImagePlus className="size-4" />
                                    <span>Add image</span>
                                </button>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="sr-only"
                            onChange={handleFileSelect}
                        />
                    </div>
                    {uploadProgress !== null && (
                        <div className="space-y-1 sm:col-span-4">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Uploading images…</span>
                                <span>{Math.round(uploadProgress * 100)}%</span>
                            </div>
                            <Progress value={uploadProgress * 100} />
                        </div>
                    )}
                </form>
                <DialogFooter>
                    <Button type="submit" form={formId} disabled={input === null || save.isPending}>
                        {save.isPending ? "Saving…" : shot === undefined ? "Create" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TaskRowActions({
    shot,
    threadUrl,
    hasThread
}: {
    readonly shot: ShotDto;
    readonly threadUrl: string | null;
    readonly hasThread: boolean;
}): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const [confirm, setConfirm] = useState<"delete" | "unbind" | null>(null);
    const remove = useMutation({
        mutationFn: () => platformApi.deleteShot(shot.id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(`Deleted ${shot.shotCode}.`);
        }
    });
    const unbind = useMutation({
        mutationFn: () => platformApi.unbindThread(shot.id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.threadMaps });
            toast.success(`Unlinked the Discord thread from ${shot.shotCode}.`);
        }
    });
    return (
        <div className="flex justify-end gap-1">
            <TaskFormDialog
                key={shot.updatedAt}
                shot={shot}
                trigger={
                    <Button size="xs" variant="ghost">
                        Edit
                    </Button>
                }
            />
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-xs" variant="ghost" aria-label={`More actions for ${shot.shotCode}`}>
                        <MoreHorizontal />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                        <Link href={`/grabbox/${shot.id}` as Route}>Open task page</Link>
                    </DropdownMenuItem>
                    {threadUrl !== null && (
                        <DropdownMenuItem asChild>
                            <a href={threadUrl} target="_blank" rel="noopener noreferrer">
                                Discord thread
                                <ExternalLink className="ml-auto" />
                            </a>
                        </DropdownMenuItem>
                    )}
                    {hasThread && (
                        <DropdownMenuItem
                            onSelect={() => {
                                setConfirm("unbind");
                            }}
                        >
                            Unlink Discord thread
                        </DropdownMenuItem>
                    )}
                    {hasAtLeast(user, Role.Admin) && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => {
                                    setConfirm("delete");
                                }}
                            >
                                Delete
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {confirm !== null && (
                <ConfirmDialog
                    title={confirm === "delete" ? `Delete ${shot.shotCode}?` : `Unlink the thread from ${shot.shotCode}?`}
                    description={
                        confirm === "delete"
                            ? "Deletes the task, its submissions, and cleans up the Discord forum thread."
                            : "The bot stops posting updates to that thread."
                    }
                    confirmLabel={confirm === "delete" ? "Delete" : "Unlink"}
                    destructive={confirm === "delete"}
                    onCancel={() => {
                        setConfirm(null);
                    }}
                    onConfirm={() => {
                        if (confirm === "delete") {
                            remove.mutate();
                        } else {
                            unbind.mutate();
                        }
                        setConfirm(null);
                    }}
                />
            )}
        </div>
    );
}

interface ConfirmDialogProps {
    readonly title: string;
    readonly description: string;
    readonly confirmLabel: string;
    readonly destructive: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}

function ConfirmDialog({ title, description, confirmLabel, destructive, onConfirm, onCancel }: ConfirmDialogProps): ReactNode {
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) {
                    onCancel();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <p className="text-muted-foreground text-sm">{description}</p>
                <DialogFooter>
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function TasksTable(): ReactNode {
    const siteConfig = useSiteConfig();
    const [status, setStatus] = useState<ShotStatus | typeof anyValue>(anyValue);
    const [difficulty, setDifficulty] = useState<DifficultyTier | typeof anyValue>(anyValue);
    const [page, setPage] = useState(1);
    const query = {
        page,
        perPage: 25,
        status: status === anyValue ? undefined : status,
        difficultyTier: difficulty === anyValue ? undefined : difficulty
    };
    const shots = useQuery({
        queryKey: queryKeys.shots(query),
        queryFn: () => platformApi.shots(query),
        placeholderData: keepPreviousData
    });
    const threads = useQuery({ queryKey: queryKeys.threadMaps, queryFn: () => platformApi.threadMaps(), staleTime: 60_000 });
    const threadByShot = new Map((threads.data ?? []).map((map) => [map.shotId, map.discordThreadId]));

    return (
        <>
            <Toolbar
                trailing={
                    shots.data === undefined ? undefined : (
                        <span className="text-muted-foreground text-xs">{shots.data.meta.total} tasks</span>
                    )
                }
            >
                <Select
                    value={status}
                    onValueChange={(value) => {
                        setStatus(value as ShotStatus | typeof anyValue);
                        setPage(1);
                    }}
                >
                    <SelectTrigger size="sm" className="w-36" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any status</SelectItem>
                        {Object.values(ShotStatus).map((item) => (
                            <SelectItem key={item} value={item}>
                                {shotStatusLabels[item]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={difficulty}
                    onValueChange={(value) => {
                        setDifficulty(value as DifficultyTier | typeof anyValue);
                        setPage(1);
                    }}
                >
                    <SelectTrigger size="sm" className="w-36" aria-label="Difficulty">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any difficulty</SelectItem>
                        {Object.values(DifficultyTier).map((item) => (
                            <SelectItem key={item} value={item}>
                                {difficultyLabels[item]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Toolbar>
            {shots.isPending ? (
                <LoadingRows rows={6} />
            ) : shots.isError ? (
                <ErrorState error={shots.error} onRetry={() => void shots.refetch()} />
            ) : shots.data.data.length === 0 ? (
                <EmptyState title="No tasks" />
            ) : (
                <>
                    <div className="bg-card overflow-x-auto rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-28">Code</TableHead>
                                    <TableHead>Title</TableHead>
                                    <TableHead className="w-16">Scene</TableHead>
                                    <TableHead className="w-24">Difficulty</TableHead>
                                    <TableHead className="w-28">Status</TableHead>
                                    <TableHead className="w-36">Claimant</TableHead>
                                    <TableHead className="w-24" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shots.data.data.map((shot) => {
                                    const threadId = threadByShot.get(shot.id);
                                    return (
                                        <TableRow key={shot.id}>
                                            <TableCell className="text-muted-foreground font-mono text-xs">
                                                <div className="flex items-center gap-2">
                                                    {shot.imageUrls.length > 0 && (
                                                        <img
                                                            src={shot.imageUrls[0]}
                                                            alt=""
                                                            className="size-6 shrink-0 rounded border object-cover"
                                                            loading="lazy"
                                                        />
                                                    )}
                                                    <span>{shot.shotCode}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-80 truncate font-medium">{shot.title}</TableCell>
                                            <TableCell className="tabular-nums">{shot.sceneNumber}</TableCell>
                                            <TableCell>{difficultyLabels[shot.difficultyTier]}</TableCell>
                                            <TableCell>
                                                <ShotStatusBadge status={shot.status} />
                                            </TableCell>
                                            <TableCell className="text-muted-foreground max-w-36 truncate">
                                                {shot.claimer?.username ?? "–"}
                                            </TableCell>
                                            <TableCell>
                                                <TaskRowActions
                                                    shot={shot}
                                                    hasThread={threadId !== undefined}
                                                    threadUrl={threadId === undefined ? null : discordThreadUrl(siteConfig, threadId)}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                    <Pagination meta={shots.data.meta} onPageChange={setPage} />
                </>
            )}
        </>
    );
}

function ReclaimButton(): ReactNode {
    const queryClient = useQueryClient();
    const reclaim = useMutation({
        mutationFn: () => platformApi.reclaimExpired(),
        onSuccess: (result) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.shotsAll });
            toast.success(result.reclaimedCount === 0 ? "No overdue claims." : `Reclaimed ${result.shotCodes.join(", ")}.`);
        }
    });
    return (
        <ConfirmButton
            title="Reclaim overdue tasks?"
            description="Every claim past its deadline returns to the grab-box."
            confirmLabel="Reclaim"
            variant="outline"
            disabled={reclaim.isPending}
            onConfirm={() => {
                reclaim.mutate();
            }}
        >
            Reclaim overdue
        </ConfirmButton>
    );
}

export function TasksPage(): ReactNode {
    return (
        <RequireRole role={Role.Supervisor}>
            <PageHeader
                title="Tasks"
                actions={
                    <>
                        <ReclaimButton />
                        <TaskFormDialog
                            trigger={
                                <Button size="sm">
                                    <Plus />
                                    New task
                                </Button>
                            }
                        />
                    </>
                }
            />
            <TasksTable />
        </RequireRole>
    );
}
