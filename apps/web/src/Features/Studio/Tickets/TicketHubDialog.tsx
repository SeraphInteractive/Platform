"use client";

import {
    DiscordChannelKind,
    ticketLimits,
    TicketHubStyle,
    type CreateTicketHubDto,
    type TicketCategoryDto,
    type TicketHubDto
} from "@platform/contracts";
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
import { RadioGroup, RadioGroupItem } from "@/Components/Ui/radio-group";
import { Textarea } from "@/Components/Ui/textarea";
import { ChannelSelect } from "./DiscordPickers";

const hubChannelKinds: readonly DiscordChannelKind[] = [DiscordChannelKind.Text, DiscordChannelKind.Announcement];
const defaultColor = "#3b82f6";

interface HubDraft {
    readonly name: string;
    readonly channelId: string | null;
    readonly title: string;
    readonly description: string;
    readonly style: TicketHubStyle;
    readonly useColor: boolean;
    readonly color: string;
    readonly categoryIds: string[];
    readonly isEnabled: boolean;
}

function hex(value: number | null): string {
    return value === null ? defaultColor : `#${value.toString(16).padStart(6, "0")}`;
}

function draftOf(hub: TicketHubDto | undefined): HubDraft {
    return {
        name: hub?.name ?? "",
        channelId: hub?.channelId ?? null,
        title: hub?.title ?? "Open a ticket",
        description: hub?.description ?? "",
        style: hub?.style ?? TicketHubStyle.Buttons,
        useColor: hub?.color !== null && hub?.color !== undefined,
        color: hex(hub?.color ?? null),
        categoryIds: [...(hub?.categoryIds ?? [])],
        isEnabled: hub?.isEnabled ?? true
    };
}

function toInput(draft: HubDraft): CreateTicketHubDto {
    return {
        name: draft.name.trim(),
        channelId: draft.channelId,
        title: draft.title.trim(),
        description: draft.description.trim(),
        style: draft.style,
        color: draft.useColor ? Number.parseInt(draft.color.slice(1), 16) : null,
        categoryIds: draft.categoryIds,
        isEnabled: draft.isEnabled
    };
}

interface TicketHubDialogProps {
    readonly hub?: TicketHubDto;
    readonly categories: readonly TicketCategoryDto[];
    readonly trigger: ReactNode;
}

export function TicketHubDialog({ hub, categories, trigger }: TicketHubDialogProps): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<HubDraft>(() => draftOf(hub));
    const update = (patch: Partial<HubDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    const problem =
        draft.name.trim().length === 0 ? "Give the hub a name." : draft.title.trim().length === 0 ? "Give the hub message a title." : null;

    const save = useMutation({
        mutationFn: () =>
            hub === undefined ? platformApi.createTicketHub(toInput(draft)) : platformApi.updateTicketHub(hub.id, toInput(draft)),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success(hub === undefined ? "Hub created. The bot will post it shortly." : "Hub saved. The bot will update it shortly.");
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

    const toggleCategory = (categoryId: string, checked: boolean): void => {
        update({
            categoryIds: checked ? [...draft.categoryIds, categoryId] : draft.categoryIds.filter((id) => id !== categoryId)
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setDraft(draftOf(hub));
                }
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{hub === undefined ? "New ticket hub" : `Edit ${hub.name}`}</DialogTitle>
                    <DialogDescription>
                        A hub is a message in Discord where members start tickets. Post several to give different channels different
                        categories.
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-name`}>Name</Label>
                            <Input
                                id={`${formId}-name`}
                                value={draft.name}
                                maxLength={ticketLimits.name}
                                placeholder="Main hub"
                                onChange={(event) => update({ name: event.target.value })}
                            />
                            <p className="text-muted-foreground text-xs">Only shown here.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-channel`}>Channel</Label>
                            <ChannelSelect
                                id={`${formId}-channel`}
                                value={draft.channelId}
                                kinds={hubChannelKinds}
                                noneLabel="Not posted"
                                onChange={(channelId) => update({ channelId })}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-title`}>Title</Label>
                        <Input
                            id={`${formId}-title`}
                            value={draft.title}
                            maxLength={ticketLimits.hubTitle}
                            onChange={(event) => update({ title: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-description`}>Description</Label>
                        <Textarea
                            id={`${formId}-description`}
                            rows={3}
                            value={draft.description}
                            maxLength={ticketLimits.hubDescription}
                            placeholder="Pick what you need help with. Your ticket opens as a private thread only you and staff can see."
                            onChange={(event) => update({ description: event.target.value })}
                        />
                        <p className="text-muted-foreground text-xs">Discord markdown works.</p>
                    </div>
                    <div className="space-y-2">
                        <Label>Layout</Label>
                        <RadioGroup
                            value={draft.style}
                            onValueChange={(value) => update({ style: value as TicketHubStyle })}
                            className="grid gap-2 sm:grid-cols-2"
                        >
                            <Label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal">
                                <RadioGroupItem value={TicketHubStyle.Buttons} className="mt-0.5" />
                                <span>
                                    <span className="block font-medium">Buttons</span>
                                    <span className="text-muted-foreground text-xs">One button per category, up to 20.</span>
                                </span>
                            </Label>
                            <Label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal">
                                <RadioGroupItem value={TicketHubStyle.Menu} className="mt-0.5" />
                                <span>
                                    <span className="block font-medium">Dropdown</span>
                                    <span className="text-muted-foreground text-xs">A compact menu with descriptions.</span>
                                </span>
                            </Label>
                        </RadioGroup>
                    </div>
                    <div className="space-y-2">
                        <Label>Categories</Label>
                        <p className="text-muted-foreground text-xs">
                            Leave all unticked to show every enabled category. Ticked ones show in this order.
                        </p>
                        {categories.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Create a category first.</p>
                        ) : (
                            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                                {categories.map((category) => (
                                    <div key={category.id} className="flex items-center gap-2">
                                        <Checkbox
                                            id={`${formId}-category-${category.id}`}
                                            checked={draft.categoryIds.includes(category.id)}
                                            onCheckedChange={(checked) => toggleCategory(category.id, checked === true)}
                                        />
                                        <Label htmlFor={`${formId}-category-${category.id}`} className="truncate font-normal">
                                            {category.emoji !== null && `${category.emoji} `}
                                            {category.name}
                                            {draft.categoryIds.includes(category.id) && (
                                                <span className="text-muted-foreground ml-1 text-xs">
                                                    #{draft.categoryIds.indexOf(category.id) + 1}
                                                </span>
                                            )}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`${formId}-color-on`}
                                checked={draft.useColor}
                                onCheckedChange={(checked) => update({ useColor: checked === true })}
                            />
                            <Label htmlFor={`${formId}-color-on`} className="font-normal">
                                Custom accent colour
                            </Label>
                            <input
                                type="color"
                                aria-label="Accent colour"
                                value={draft.color}
                                disabled={!draft.useColor}
                                onChange={(event) => update({ color: event.target.value })}
                                className="h-7 w-10 cursor-pointer rounded border disabled:opacity-40"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`${formId}-enabled`}
                                checked={draft.isEnabled}
                                onCheckedChange={(checked) => update({ isEnabled: checked === true })}
                            />
                            <Label htmlFor={`${formId}-enabled`} className="font-normal">
                                Posted in Discord
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
                        {hub === undefined ? "Create" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
