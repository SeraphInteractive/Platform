"use client";

import { DiscordChannelKind, ticketLimits, type CreateTicketCategoryDto, type TicketCategoryDto } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Textarea } from "@/Components/Ui/textarea";
import { ChannelSelect, RoleMultiSelect } from "./DiscordPickers";

const textChannelKinds: readonly DiscordChannelKind[] = [DiscordChannelKind.Text];

interface CategoryDraft {
    readonly name: string;
    readonly description: string;
    readonly emoji: string;
    readonly position: string;
    readonly isEnabled: boolean;
    readonly threadChannelId: string | null;
    readonly notificationChannelId: string | null;
    readonly logChannelId: string | null;
    readonly staffRoleIds: string[];
    readonly mentionStaff: boolean;
}

function draftOf(category: TicketCategoryDto | undefined): CategoryDraft {
    return {
        name: category?.name ?? "",
        description: category?.description ?? "",
        emoji: category?.emoji ?? "",
        position: String(category?.position ?? 0),
        isEnabled: category?.isEnabled ?? true,
        threadChannelId: category?.threadChannelId ?? null,
        notificationChannelId: category?.notificationChannelId ?? null,
        logChannelId: category?.logChannelId ?? null,
        staffRoleIds: [...(category?.staffRoleIds ?? [])],
        mentionStaff: category?.mentionStaff ?? true
    };
}

function toInput(draft: CategoryDraft): CreateTicketCategoryDto {
    const description = draft.description.trim();
    const emoji = draft.emoji.trim();
    return {
        name: draft.name.trim(),
        description: description.length === 0 ? null : description,
        emoji: emoji.length === 0 ? null : emoji,
        position: Number(draft.position) || 0,
        isEnabled: draft.isEnabled,
        threadChannelId: draft.threadChannelId,
        notificationChannelId: draft.notificationChannelId,
        logChannelId: draft.logChannelId,
        staffRoleIds: draft.staffRoleIds,
        mentionStaff: draft.mentionStaff
    };
}

export function TicketCategoryDialog({
    category,
    trigger
}: {
    readonly category?: TicketCategoryDto;
    readonly trigger: ReactNode;
}): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<CategoryDraft>(() => draftOf(category));
    const update = (patch: Partial<CategoryDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    const problem = draft.name.trim().length === 0 ? "Give the category a name." : null;

    const save = useMutation({
        mutationFn: () =>
            category === undefined
                ? platformApi.createTicketCategory(toInput(draft))
                : platformApi.updateTicketCategory(category.id, toInput(draft)),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success(category === undefined ? "Category created." : "Category saved.");
            setOpen(false);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (problem === null && !save.isPending) {
            save.mutate();
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setDraft(draftOf(category));
                }
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{category === undefined ? "New ticket category" : `Edit ${category.name}`}</DialogTitle>
                    <DialogDescription>Each category is a button on the ticket hub with its own channels and staff.</DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    <div className="grid gap-4 sm:grid-cols-[1fr_6rem_6rem]">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-name`}>Name</Label>
                            <Input
                                id={`${formId}-name`}
                                value={draft.name}
                                maxLength={ticketLimits.name}
                                onChange={(event) => update({ name: event.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-emoji`}>Emoji</Label>
                            <Input
                                id={`${formId}-emoji`}
                                value={draft.emoji}
                                placeholder=""
                                maxLength={ticketLimits.emoji}
                                onChange={(event) => update({ emoji: event.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-order`}>Order</Label>
                            <Input
                                id={`${formId}-order`}
                                type="number"
                                min={0}
                                max={1000}
                                value={draft.position}
                                onChange={(event) => update({ position: event.target.value })}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-description`}>Description</Label>
                        <Textarea
                            id={`${formId}-description`}
                            rows={2}
                            value={draft.description}
                            maxLength={ticketLimits.categoryDescription}
                            onChange={(event) => update({ description: event.target.value })}
                        />
                        <p className="text-muted-foreground text-xs">Shown on the hub above the buttons.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-thread`}>Ticket channel</Label>
                        <ChannelSelect
                            id={`${formId}-thread`}
                            value={draft.threadChannelId}
                            kinds={textChannelKinds}
                            onChange={(threadChannelId) => update({ threadChannelId })}
                        />
                        <p className="text-muted-foreground text-xs">
                            Tickets open as private threads here. Anyone with Manage Threads on this channel can read every ticket in it, so
                            give each category its own channel when access must differ.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-notify`}>Staff hub channel</Label>
                        <ChannelSelect
                            id={`${formId}-notify`}
                            value={draft.notificationChannelId}
                            onChange={(notificationChannelId) => update({ notificationChannelId })}
                        />
                        <p className="text-muted-foreground text-xs">
                            New tickets post a card here with a Join button, so staff opt in to the tickets they take.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-log`}>Log channel</Label>
                        <ChannelSelect
                            id={`${formId}-log`}
                            value={draft.logChannelId}
                            noneLabel="Use the main log channel"
                            onChange={(logChannelId) => update({ logChannelId })}
                        />
                        <p className="text-muted-foreground text-xs">
                            Send this category&apos;s logs and transcripts somewhere other than the main log.
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-staff`}>Staff roles</Label>
                        <RoleMultiSelect
                            id={`${formId}-staff`}
                            value={draft.staffRoleIds}
                            onChange={(staffRoleIds) => update({ staffRoleIds })}
                        />
                        <p className="text-muted-foreground text-xs">
                            Can join and decide tickets in this category. Ticket types can override this.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`${formId}-enabled`}
                                checked={draft.isEnabled}
                                onCheckedChange={(value) => update({ isEnabled: value === true })}
                            />
                            <Label htmlFor={`${formId}-enabled`} className="font-normal">
                                Show on the hub
                            </Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`${formId}-mention`}
                                checked={draft.mentionStaff}
                                onCheckedChange={(value) => update({ mentionStaff: value === true })}
                            />
                            <Label htmlFor={`${formId}-mention`} className="font-normal">
                                Ping staff roles on new tickets
                            </Label>
                        </div>
                    </div>
                </form>
                {problem !== null && <p className="text-destructive text-xs">{problem}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={problem !== null || save.isPending}>
                        {category === undefined ? "Create" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
