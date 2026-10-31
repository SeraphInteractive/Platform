"use client";

import {
    DiscordChannelKind,
    PositionStatus,
    TicketKind,
    ticketLimits,
    TicketQuestionStyle,
    type CreateTicketTypeDto,
    type TicketCategoryDto,
    type TicketQuestionDto,
    type TicketTypeDto
} from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { Textarea } from "@/Components/Ui/textarea";
import { fromLocalInputValue, toLocalInputValue } from "@/Lib/Format";
import { ChannelSelect, RoleMultiSelect } from "./DiscordPickers";

const textChannelKinds: readonly DiscordChannelKind[] = [DiscordChannelKind.Text];

const positionStatusLabels: Readonly<Record<PositionStatus, string>> = {
    [PositionStatus.Open]: "Open",
    [PositionStatus.Closed]: "Closed",
    [PositionStatus.Filled]: "Filled"
};

interface QuestionDraft {
    readonly key: string;
    readonly id: string;
    readonly label: string;
    readonly placeholder: string;
    readonly style: TicketQuestionStyle;
    readonly required: boolean;
    readonly minLength: string;
    readonly maxLength: string;
}

interface TypeDraft {
    readonly name: string;
    readonly description: string;
    readonly emoji: string;
    readonly kind: TicketKind;
    readonly position: string;
    readonly isEnabled: boolean;
    readonly staffRoleIds: string[];
    readonly threadChannelId: string | null;
    readonly mentionStaff: boolean;
    readonly questions: QuestionDraft[];
    readonly positionStatus: PositionStatus;
    readonly openings: string;
    readonly opensAt: string;
    readonly closesAt: string;
    readonly hasListing: boolean;
    readonly overview: string;
    readonly requirements: string;
    readonly responsibilities: string;
    readonly process: string;
    readonly about: string;
    readonly interviewMessage: string;
    readonly acceptedMessage: string;
    readonly rejectedMessage: string;
    readonly resetFilledCount: boolean;
}

let questionKeyCounter = 0;

function questionDraftOf(question: TicketQuestionDto): QuestionDraft {
    questionKeyCounter += 1;
    return {
        key: `q${questionKeyCounter}`,
        id: question.id,
        label: question.label,
        placeholder: question.placeholder ?? "",
        style: question.style,
        required: question.required,
        minLength: String(question.minLength),
        maxLength: String(question.maxLength)
    };
}

function draftOf(type: TicketTypeDto | undefined, kind: TicketKind): TypeDraft {
    return {
        name: type?.name ?? "",
        description: type?.description ?? "",
        emoji: type?.emoji ?? "",
        kind: type?.kind ?? kind,
        position: String(type?.position ?? 0),
        isEnabled: type?.isEnabled ?? true,
        staffRoleIds: [...(type?.staffRoleIds ?? [])],
        threadChannelId: type?.threadChannelId ?? null,
        mentionStaff: type?.mentionStaff ?? true,
        questions: (type?.questions ?? []).map(questionDraftOf),
        positionStatus: type?.positionStatus ?? PositionStatus.Open,
        openings: type?.openings === null || type?.openings === undefined ? "" : String(type.openings),
        opensAt: toLocalInputValue(type?.opensAt ?? null),
        closesAt: toLocalInputValue(type?.closesAt ?? null),
        hasListing: type?.listing !== null && type?.listing !== undefined,
        overview: type?.listing?.overview ?? "",
        requirements: (type?.listing?.requirements ?? []).join("\n"),
        responsibilities: (type?.listing?.responsibilities ?? []).join("\n"),
        process: type?.listing?.process ?? "",
        about: type?.listing?.about ?? "",
        interviewMessage: type?.messages.interview ?? "",
        acceptedMessage: type?.messages.accepted ?? "",
        rejectedMessage: type?.messages.rejected ?? "",
        resetFilledCount: false
    };
}

function slugOf(label: string, taken: ReadonlySet<string>): string {
    const base =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/gu, "_")
            .replace(/^_+|_+$/gu, "")
            .slice(0, 28) || "question";
    let candidate = base;
    for (let suffix = 2; taken.has(candidate); suffix++) {
        candidate = `${base}_${suffix}`;
    }
    return candidate;
}

function lines(value: string): string[] {
    return value
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function nullable(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}

function problemsOf(draft: TypeDraft): string[] {
    const problems: string[] = [];
    if (draft.name.trim().length === 0) problems.push("Give the ticket type a name.");
    if (draft.questions.some((question) => question.label.trim().length === 0)) problems.push("Every form question needs a label.");
    for (const question of draft.questions) {
        const min = Number(question.minLength);
        const max = Number(question.maxLength);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || max > ticketLimits.answerLength || min > max) {
            problems.push(
                `"${question.label || "Untitled"}" needs lengths between 0 and ${ticketLimits.answerLength}, minimum below maximum.`
            );
        }
    }
    if (draft.openings.trim().length > 0) {
        const openings = Number(draft.openings);
        if (!Number.isInteger(openings) || openings < 1 || openings > ticketLimits.openings) {
            problems.push(`Openings must be a whole number from 1 to ${ticketLimits.openings}, or blank for no limit.`);
        }
    }
    const opensAt = fromLocalInputValue(draft.opensAt);
    const closesAt = fromLocalInputValue(draft.closesAt);
    if (opensAt !== null && closesAt !== null && new Date(closesAt) <= new Date(opensAt)) {
        problems.push("The application window must close after it opens.");
    }
    if (lines(draft.requirements).length > ticketLimits.listingItems || lines(draft.responsibilities).length > ticketLimits.listingItems) {
        problems.push(`Listings hold at most ${ticketLimits.listingItems} requirements and responsibilities.`);
    }
    return problems;
}

function toInput(draft: TypeDraft, categoryId: string): CreateTicketTypeDto {
    const taken = new Set(draft.questions.map((question) => question.id).filter((id) => id.length > 0));
    const questions = draft.questions.map((question) => {
        const id = question.id.length > 0 ? question.id : slugOf(question.label, taken);
        taken.add(id);
        return {
            id,
            label: question.label.trim(),
            placeholder: nullable(question.placeholder),
            style: question.style,
            required: question.required,
            minLength: Number(question.minLength),
            maxLength: Number(question.maxLength)
        };
    });
    const isApplication = draft.kind === TicketKind.Application;
    return {
        categoryId,
        name: draft.name.trim(),
        description: nullable(draft.description),
        emoji: nullable(draft.emoji),
        kind: draft.kind,
        position: Number(draft.position) || 0,
        isEnabled: draft.isEnabled,
        staffRoleIds: draft.staffRoleIds,
        threadChannelId: draft.threadChannelId,
        mentionStaff: draft.mentionStaff,
        questions,
        positionStatus: isApplication ? draft.positionStatus : PositionStatus.Open,
        openings: isApplication && draft.openings.trim().length > 0 ? Number(draft.openings) : null,
        opensAt: isApplication ? fromLocalInputValue(draft.opensAt) : null,
        closesAt: isApplication ? fromLocalInputValue(draft.closesAt) : null,
        listing: draft.hasListing
            ? {
                  overview: draft.overview.trim(),
                  requirements: lines(draft.requirements),
                  responsibilities: lines(draft.responsibilities),
                  process: draft.process.trim(),
                  about: draft.about.trim()
              }
            : null,
        messages: {
            interview: nullable(draft.interviewMessage),
            accepted: nullable(draft.acceptedMessage),
            rejected: nullable(draft.rejectedMessage)
        }
    };
}

function Field({
    id,
    label,
    hint,
    children
}: {
    readonly id: string;
    readonly label: string;
    readonly hint?: ReactNode;
    readonly children: ReactNode;
}): ReactNode {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            {children}
            {hint !== undefined && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
    );
}

function CheckField({
    id,
    label,
    checked,
    onChange
}: {
    readonly id: string;
    readonly label: string;
    readonly checked: boolean;
    readonly onChange: (checked: boolean) => void;
}): ReactNode {
    return (
        <div className="flex items-center gap-2">
            <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
            <Label htmlFor={id} className="font-normal">
                {label}
            </Label>
        </div>
    );
}

interface TicketTypeDialogProps {
    readonly category: TicketCategoryDto;
    readonly type?: TicketTypeDto;
    readonly defaultKind?: TicketKind;
    readonly trigger: ReactNode;
}

export function TicketTypeDialog({ category, type, defaultKind = TicketKind.Support, trigger }: TicketTypeDialogProps): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<TypeDraft>(() => draftOf(type, defaultKind));
    const [tab, setTab] = useState("basics");
    const problems = problemsOf(draft);
    const isApplication = draft.kind === TicketKind.Application;

    const update = (patch: Partial<TypeDraft>): void => setDraft((current) => ({ ...current, ...patch }));
    const updateQuestion = (key: string, patch: Partial<QuestionDraft>): void =>
        setDraft((current) => ({
            ...current,
            questions: current.questions.map((question) => (question.key === key ? { ...question, ...patch } : question))
        }));
    const moveQuestion = (index: number, offset: number): void =>
        setDraft((current) => {
            const questions = [...current.questions];
            const [moved] = questions.splice(index, 1);
            if (moved !== undefined) {
                questions.splice(index + offset, 0, moved);
            }
            return { ...current, questions };
        });

    const save = useMutation({
        mutationFn: async () => {
            const input = toInput(draft, category.id);
            if (type === undefined) {
                return platformApi.createTicketType(input);
            }
            return platformApi.updateTicketType(type.id, { ...input, resetFilledCount: draft.resetFilledCount });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.ticketConfig });
            toast.success(type === undefined ? "Ticket type created." : "Ticket type saved.");
            setOpen(false);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const onSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
        event.preventDefault();
        if (problems.length === 0 && !save.isPending) {
            save.mutate();
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setDraft(draftOf(type, defaultKind));
                    setTab("basics");
                }
            }}
        >
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent className="flex max-h-[90vh] flex-col gap-4 sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{type === undefined ? `New ticket type in ${category.name}` : `Edit ${type.name}`}</DialogTitle>
                    <DialogDescription>
                        Members pick this from the {category.name} menu on the ticket hub. Applications can carry a listing and track filled
                        seats.
                    </DialogDescription>
                </DialogHeader>
                <form id={formId} onSubmit={onSubmit} className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <Tabs value={tab} onValueChange={setTab}>
                        <TabsList>
                            <TabsTrigger value="basics">Basics</TabsTrigger>
                            <TabsTrigger value="form">Form ({draft.questions.length})</TabsTrigger>
                            <TabsTrigger value="listing">Listing</TabsTrigger>
                            {isApplication && <TabsTrigger value="position">Position</TabsTrigger>}
                            {isApplication && <TabsTrigger value="messages">Messages</TabsTrigger>}
                        </TabsList>

                        <TabsContent value="basics" className="space-y-4 pt-2">
                            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                                <Field id={`${formId}-name`} label="Name">
                                    <Input
                                        id={`${formId}-name`}
                                        value={draft.name}
                                        maxLength={ticketLimits.name}
                                        onChange={(event) => update({ name: event.target.value })}
                                    />
                                </Field>
                                <Field id={`${formId}-emoji`} label="Emoji">
                                    <Input
                                        id={`${formId}-emoji`}
                                        value={draft.emoji}
                                        maxLength={ticketLimits.emoji}
                                        placeholder=""
                                        onChange={(event) => update({ emoji: event.target.value })}
                                    />
                                </Field>
                            </div>
                            <Field id={`${formId}-description`} label="Menu description" hint="Shown under the option in Discord.">
                                <Input
                                    id={`${formId}-description`}
                                    value={draft.description}
                                    maxLength={ticketLimits.typeDescription}
                                    onChange={(event) => update({ description: event.target.value })}
                                />
                            </Field>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field id={`${formId}-kind`} label="Kind">
                                    <Select value={draft.kind} onValueChange={(value) => update({ kind: value as TicketKind })}>
                                        <SelectTrigger id={`${formId}-kind`} className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={TicketKind.Support}>Support request</SelectItem>
                                            <SelectItem value={TicketKind.Application}>Application</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field id={`${formId}-position`} label="Order" hint="Lower numbers come first.">
                                    <Input
                                        id={`${formId}-position`}
                                        type="number"
                                        min={0}
                                        max={1000}
                                        value={draft.position}
                                        onChange={(event) => update({ position: event.target.value })}
                                    />
                                </Field>
                            </div>
                            <Field
                                id={`${formId}-staff`}
                                label="Staff roles"
                                hint="Who can join and decide these tickets. Leave empty to use the category's staff roles."
                            >
                                <RoleMultiSelect
                                    id={`${formId}-staff`}
                                    value={draft.staffRoleIds}
                                    onChange={(staffRoleIds) => update({ staffRoleIds })}
                                />
                            </Field>
                            <Field
                                id={`${formId}-thread`}
                                label="Ticket channel override"
                                hint="Private threads open here instead of the category's ticket channel."
                            >
                                <ChannelSelect
                                    id={`${formId}-thread`}
                                    value={draft.threadChannelId}
                                    kinds={textChannelKinds}
                                    placeholder="Use the category channel"
                                    onChange={(threadChannelId) => update({ threadChannelId })}
                                />
                            </Field>
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <CheckField
                                    id={`${formId}-enabled`}
                                    label="Accepting tickets"
                                    checked={draft.isEnabled}
                                    onChange={(isEnabled) => update({ isEnabled })}
                                />
                                <CheckField
                                    id={`${formId}-mention`}
                                    label="Ping staff roles on new tickets"
                                    checked={draft.mentionStaff}
                                    onChange={(mentionStaff) => update({ mentionStaff })}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="form" className="space-y-3 pt-2">
                            <p className="text-muted-foreground text-xs">
                                Up to {ticketLimits.questions} questions, shown as a Discord form when someone opens this ticket. Answers
                                appear at the top of the ticket.
                            </p>
                            {draft.questions.map((question, index) => (
                                <div key={question.key} className="space-y-3 rounded-md border p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-muted-foreground text-xs font-medium">Question {index + 1}</span>
                                        <div className="flex gap-1">
                                            <Button
                                                type="button"
                                                size="icon-xs"
                                                variant="ghost"
                                                aria-label="Move up"
                                                disabled={index === 0}
                                                onClick={() => moveQuestion(index, -1)}
                                            >
                                                <ArrowUp />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="icon-xs"
                                                variant="ghost"
                                                aria-label="Move down"
                                                disabled={index === draft.questions.length - 1}
                                                onClick={() => moveQuestion(index, 1)}
                                            >
                                                <ArrowDown />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="icon-xs"
                                                variant="ghost"
                                                aria-label="Remove question"
                                                onClick={() =>
                                                    update({ questions: draft.questions.filter((item) => item.key !== question.key) })
                                                }
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                                        <Field id={`${formId}-${question.key}-label`} label="Label">
                                            <Input
                                                id={`${formId}-${question.key}-label`}
                                                value={question.label}
                                                maxLength={ticketLimits.questionLabel}
                                                onChange={(event) => updateQuestion(question.key, { label: event.target.value })}
                                            />
                                        </Field>
                                        <Field id={`${formId}-${question.key}-style`} label="Answer">
                                            <Select
                                                value={question.style}
                                                onValueChange={(value) =>
                                                    updateQuestion(question.key, { style: value as TicketQuestionStyle })
                                                }
                                            >
                                                <SelectTrigger id={`${formId}-${question.key}-style`} className="w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={TicketQuestionStyle.Short}>Short</SelectItem>
                                                    <SelectItem value={TicketQuestionStyle.Paragraph}>Paragraph</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    </div>
                                    <Field id={`${formId}-${question.key}-placeholder`} label="Placeholder">
                                        <Input
                                            id={`${formId}-${question.key}-placeholder`}
                                            value={question.placeholder}
                                            maxLength={ticketLimits.questionPlaceholder}
                                            onChange={(event) => updateQuestion(question.key, { placeholder: event.target.value })}
                                        />
                                    </Field>
                                    <div className="flex flex-wrap items-end gap-4">
                                        <Field id={`${formId}-${question.key}-min`} label="Min length">
                                            <Input
                                                id={`${formId}-${question.key}-min`}
                                                type="number"
                                                className="w-24"
                                                min={0}
                                                max={ticketLimits.answerLength}
                                                value={question.minLength}
                                                onChange={(event) => updateQuestion(question.key, { minLength: event.target.value })}
                                            />
                                        </Field>
                                        <Field id={`${formId}-${question.key}-max`} label="Max length">
                                            <Input
                                                id={`${formId}-${question.key}-max`}
                                                type="number"
                                                className="w-24"
                                                min={1}
                                                max={ticketLimits.answerLength}
                                                value={question.maxLength}
                                                onChange={(event) => updateQuestion(question.key, { maxLength: event.target.value })}
                                            />
                                        </Field>
                                        <div className="pb-2">
                                            <CheckField
                                                id={`${formId}-${question.key}-required`}
                                                label="Required"
                                                checked={question.required}
                                                onChange={(required) => updateQuestion(question.key, { required })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={draft.questions.length >= ticketLimits.questions}
                                onClick={() => {
                                    questionKeyCounter += 1;
                                    update({
                                        questions: [
                                            ...draft.questions,
                                            {
                                                key: `q${questionKeyCounter}`,
                                                id: "",
                                                label: "",
                                                placeholder: "",
                                                style: TicketQuestionStyle.Paragraph,
                                                required: true,
                                                minLength: "0",
                                                maxLength: "1000"
                                            }
                                        ]
                                    });
                                }}
                            >
                                <Plus />
                                Add question
                            </Button>
                        </TabsContent>

                        <TabsContent value="listing" className="space-y-4 pt-2">
                            <CheckField
                                id={`${formId}-has-listing`}
                                label="Show a listing before the form"
                                checked={draft.hasListing}
                                onChange={(hasListing) => update({ hasListing })}
                            />
                            <p className="text-muted-foreground text-xs">
                                Members read the listing in Discord and press Apply to continue. Application listings also appear on the
                                public Positions page. Markdown works.
                            </p>
                            {draft.hasListing && (
                                <>
                                    <Field id={`${formId}-overview`} label="Position overview">
                                        <Textarea
                                            id={`${formId}-overview`}
                                            rows={4}
                                            value={draft.overview}
                                            maxLength={ticketLimits.listingOverview}
                                            onChange={(event) => update({ overview: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-requirements`} label="Requirements" hint="One per line.">
                                        <Textarea
                                            id={`${formId}-requirements`}
                                            rows={4}
                                            value={draft.requirements}
                                            onChange={(event) => update({ requirements: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-responsibilities`} label="Responsibilities" hint="One per line.">
                                        <Textarea
                                            id={`${formId}-responsibilities`}
                                            rows={4}
                                            value={draft.responsibilities}
                                            onChange={(event) => update({ responsibilities: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-process`} label="Application process">
                                        <Textarea
                                            id={`${formId}-process`}
                                            rows={3}
                                            value={draft.process}
                                            maxLength={ticketLimits.listingSection}
                                            onChange={(event) => update({ process: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-about`} label="About Project Stairway">
                                        <Textarea
                                            id={`${formId}-about`}
                                            rows={3}
                                            value={draft.about}
                                            maxLength={ticketLimits.listingSection}
                                            onChange={(event) => update({ about: event.target.value })}
                                        />
                                    </Field>
                                </>
                            )}
                        </TabsContent>

                        {isApplication && (
                            <TabsContent value="position" className="space-y-4 pt-2">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field
                                        id={`${formId}-status`}
                                        label="Position status"
                                        hint="Filled positions stay listed but cannot be applied for."
                                    >
                                        <Select
                                            value={draft.positionStatus}
                                            onValueChange={(value) => update({ positionStatus: value as PositionStatus })}
                                        >
                                            <SelectTrigger id={`${formId}-status`} className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.values(PositionStatus).map((status) => (
                                                    <SelectItem key={status} value={status}>
                                                        {positionStatusLabels[status]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <Field
                                        id={`${formId}-openings`}
                                        label="Openings"
                                        hint="Accepting this many applicants marks the position filled. Blank for no limit."
                                    >
                                        <Input
                                            id={`${formId}-openings`}
                                            type="number"
                                            min={1}
                                            max={ticketLimits.openings}
                                            value={draft.openings}
                                            onChange={(event) => update({ openings: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-opens`} label="Applications open">
                                        <Input
                                            id={`${formId}-opens`}
                                            type="datetime-local"
                                            value={draft.opensAt}
                                            onChange={(event) => update({ opensAt: event.target.value })}
                                        />
                                    </Field>
                                    <Field id={`${formId}-closes`} label="Applications close">
                                        <Input
                                            id={`${formId}-closes`}
                                            type="datetime-local"
                                            value={draft.closesAt}
                                            onChange={(event) => update({ closesAt: event.target.value })}
                                        />
                                    </Field>
                                </div>
                                {type !== undefined && (
                                    <div className="space-y-2 rounded-md border p-3 text-sm">
                                        <p>
                                            {type.filledCount} {type.filledCount === 1 ? "applicant has" : "applicants have"} been accepted
                                            for this position.
                                        </p>
                                        <CheckField
                                            id={`${formId}-reset`}
                                            label="Reset the accepted count when saving"
                                            checked={draft.resetFilledCount}
                                            onChange={(resetFilledCount) => update({ resetFilledCount })}
                                        />
                                    </div>
                                )}
                            </TabsContent>
                        )}

                        {isApplication && (
                            <TabsContent value="messages" className="space-y-4 pt-2">
                                <p className="text-muted-foreground text-xs">
                                    Sent to the applicant by DM and posted in their ticket. Leave blank for the default wording. Use{" "}
                                    {"{position}"}, {"{user}"} and {"{ticket}"} as placeholders. Staff can add a personal note each time.
                                </p>
                                <Field id={`${formId}-interview`} label="Interview invitation">
                                    <Textarea
                                        id={`${formId}-interview`}
                                        rows={3}
                                        maxLength={ticketLimits.message}
                                        value={draft.interviewMessage}
                                        placeholder="Thanks for applying for {position}. We would like to invite you to an interview..."
                                        onChange={(event) => update({ interviewMessage: event.target.value })}
                                    />
                                </Field>
                                <Field
                                    id={`${formId}-accepted`}
                                    label="Acceptance"
                                    hint="A good place to link the onboarding document for the role."
                                >
                                    <Textarea
                                        id={`${formId}-accepted`}
                                        rows={3}
                                        maxLength={ticketLimits.message}
                                        value={draft.acceptedMessage}
                                        placeholder="Congratulations! You have been accepted as {position}..."
                                        onChange={(event) => update({ acceptedMessage: event.target.value })}
                                    />
                                </Field>
                                <Field id={`${formId}-rejected`} label="Rejection">
                                    <Textarea
                                        id={`${formId}-rejected`}
                                        rows={3}
                                        maxLength={ticketLimits.message}
                                        value={draft.rejectedMessage}
                                        placeholder="Thank you for applying for {position}. After reviewing your application..."
                                        onChange={(event) => update({ rejectedMessage: event.target.value })}
                                    />
                                </Field>
                            </TabsContent>
                        )}
                    </Tabs>
                </form>
                {problems.length > 0 && <p className="text-destructive text-xs">{problems[0]}</p>}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} disabled={problems.length > 0 || save.isPending}>
                        {type === undefined ? "Create" : "Save"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
