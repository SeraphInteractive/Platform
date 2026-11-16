"use client";

import {
    ApplicationStage,
    DiscordChannelKind,
    feedbackLimits,
    TicketKind,
    type CreateFeedbackSubjectDto,
    type FeedbackSettingsDto,
    type FeedbackSubjectDto,
    type TicketPersonDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Button } from "@/Components/Ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/Ui/dialog";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { ChannelSelect, MemberPicker, RoleMultiSelect } from "@/Features/Studio/Tickets/DiscordPickers";
import { fromLocalInputValue, toLocalInputValue } from "@/Lib/Format";

const departmentChannelKinds: readonly DiscordChannelKind[] = [DiscordChannelKind.Text, DiscordChannelKind.Announcement];
const noTicket = "none";

interface SubjectDraft {
    readonly supervisor: TicketPersonDto | null;
    readonly title: string;
    readonly channelId: string | null;
    readonly crewRoleIds: string[];
    readonly startedAt: string;
    readonly firstAfterDays: string;
    readonly intervalDays: string;
    readonly sourceTicketId: string | null;
}

function draftOf(subject: FeedbackSubjectDto | undefined, settings: FeedbackSettingsDto | undefined): SubjectDraft {
    return {
        supervisor: subject?.supervisor ?? null,
        title: subject?.title ?? "",
        channelId: subject?.channelId ?? null,
        crewRoleIds: [...(subject?.crewRoleIds ?? [])],
        startedAt: toLocalInputValue(subject?.startedAt ?? new Date().toISOString()),
        firstAfterDays: String(subject?.firstAfterDays ?? settings?.firstAfterDays ?? 30),
        intervalDays: String(subject?.intervalDays ?? settings?.intervalDays ?? 90),
        sourceTicketId: subject?.sourceTicketId ?? null
    };
}

function validDays(value: string): boolean {
    const number = Number(value);
    return Number.isInteger(number) && number >= feedbackLimits.minimumDays && number <= feedbackLimits.maximumDays;
}

interface FeedbackSubjectDialogProps {
    readonly subject?: FeedbackSubjectDto;
    readonly settings: FeedbackSettingsDto | undefined;
    readonly trigger: ReactNode;
}

export function FeedbackSubjectDialog({ subject, settings, trigger }: FeedbackSubjectDialogProps): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<SubjectDraft>(() => draftOf(subject, settings));
    const update = (patch: Partial<SubjectDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    const acceptedQuery = useQuery({
        queryKey: queryKeys.tickets({ kind: TicketKind.Application, stage: ApplicationStage.Accepted, perPage: 50 }),
        queryFn: () => platformApi.tickets({ kind: TicketKind.Application, stage: ApplicationStage.Accepted, perPage: 50 }),
        enabled: open && subject === undefined
    });

    const startedAt = fromLocalInputValue(draft.startedAt);
    const problem =
        draft.supervisor === null
            ? "Pick the supervisor."
            : draft.title.trim().length === 0
              ? "Name the position."
              : startedAt === null
                ? "Set when their tenure started."
                : !validDays(draft.firstAfterDays) || !validDays(draft.intervalDays)
                  ? `Days must be whole numbers from ${feedbackLimits.minimumDays} to ${feedbackLimits.maximumDays}.`
                  : null;

    const save = useMutation({
        mutationFn: async () => {
            const common = {
                title: draft.title.trim(),
                channelId: draft.channelId,
                crewRoleIds: draft.crewRoleIds,
                startedAt: startedAt ?? undefined,
                firstAfterDays: Number(draft.firstAfterDays),
                intervalDays: Number(draft.intervalDays)
            };
            if (subject !== undefined) {
                return platformApi.updateFeedbackSubject(subject.id, common);
            }
            if (draft.supervisor === null) {
                throw new Error("Pick the supervisor.");
            }
            const input: CreateFeedbackSubjectDto = { ...common, supervisor: draft.supervisor, sourceTicketId: draft.sourceTicketId };
            return platformApi.createFeedbackSubject(input);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackAll });
            toast.success(subject === undefined ? "Check-ins scheduled." : "Saved.");
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

    const accepted = acceptedQuery.data?.data ?? [];

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setDraft(draftOf(subject, settings));
                }
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{subject === undefined ? "Start crew check-ins" : `Edit ${subject.supervisor.username}`}</DialogTitle>
                    <DialogDescription>
                        The crew gets an optional, anonymous check-in after the first period, then on a repeating schedule while the
                        supervisor holds the role.
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                    {subject === undefined && accepted.length > 0 && (
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-ticket`}>From an accepted application</Label>
                            <Select
                                value={draft.sourceTicketId ?? noTicket}
                                onValueChange={(value) => {
                                    const ticket = accepted.find((candidate) => candidate.id === value);
                                    update(
                                        ticket === undefined
                                            ? { sourceTicketId: null }
                                            : {
                                                  sourceTicketId: ticket.id,
                                                  supervisor: ticket.opener,
                                                  title: ticket.typeName,
                                                  startedAt: toLocalInputValue(ticket.decidedAt ?? ticket.updatedAt)
                                              }
                                    );
                                }}
                            >
                                <SelectTrigger id={`${formId}-ticket`} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={noTicket}>Enter details by hand</SelectItem>
                                    {accepted.map((ticket) => (
                                        <SelectItem key={ticket.id} value={ticket.id}>
                                            {ticket.opener.username} | {ticket.typeName} (#{ticket.number})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label>Supervisor</Label>
                        {subject === undefined ? (
                            <MemberPicker
                                heading="Members"
                                onPick={(supervisor) => update({ supervisor })}
                                trigger={
                                    <Button type="button" variant="outline" className="w-full justify-between font-normal">
                                        <span className={draft.supervisor === null ? "text-muted-foreground" : undefined}>
                                            {draft.supervisor?.username ?? "Choose a member"}
                                        </span>
                                        <ChevronsUpDown className="size-4 opacity-50" />
                                    </Button>
                                }
                            />
                        ) : (
                            <p className="text-sm">{subject.supervisor.username}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-title`}>Position</Label>
                        <Input
                            id={`${formId}-title`}
                            value={draft.title}
                            maxLength={feedbackLimits.title}
                            placeholder="Animation Supervisor"
                            onChange={(event) => update({ title: event.target.value })}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-channel`}>Department announcement channel</Label>
                        <ChannelSelect
                            id={`${formId}-channel`}
                            value={draft.channelId}
                            kinds={departmentChannelKinds}
                            onChange={(channelId) => update({ channelId })}
                        />
                        <p className="text-muted-foreground text-xs">Check-ins are posted here. Nothing is sent until a channel is set.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-crew`}>Crew roles</Label>
                        <RoleMultiSelect
                            id={`${formId}-crew`}
                            value={draft.crewRoleIds}
                            onChange={(crewRoleIds) => update({ crewRoleIds })}
                        />
                        <p className="text-muted-foreground text-xs">
                            Only members with one of these roles can answer. Leave empty to let anyone in the channel answer.
                        </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-start`}>Tenure started</Label>
                            <Input
                                id={`${formId}-start`}
                                type="datetime-local"
                                value={draft.startedAt}
                                onChange={(event) => update({ startedAt: event.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-first`}>First after (days)</Label>
                            <Input
                                id={`${formId}-first`}
                                type="number"
                                min={feedbackLimits.minimumDays}
                                max={feedbackLimits.maximumDays}
                                value={draft.firstAfterDays}
                                onChange={(event) => update({ firstAfterDays: event.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={`${formId}-interval`}>Then every (days)</Label>
                            <Input
                                id={`${formId}-interval`}
                                type="number"
                                min={feedbackLimits.minimumDays}
                                max={feedbackLimits.maximumDays}
                                value={draft.intervalDays}
                                onChange={(event) => update({ intervalDays: event.target.value })}
                            />
                        </div>
                    </div>
                </form>
                {problem !== null && <p className="text-destructive text-xs">{problem}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={problem !== null || save.isPending}>
                        {subject === undefined ? "Schedule check-ins" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
