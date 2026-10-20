"use client";

import {
    FeedbackQuestionKind,
    feedbackLimits,
    Role,
    type FeedbackQuestionDto,
    type FeedbackSettingsDto,
    type FeedbackSubjectDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/Components/Ui/dropdown-menu";
import { Input } from "@/Components/Ui/input";
import { Label } from "@/Components/Ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/Components/Ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/Components/Ui/tabs";
import { Textarea } from "@/Components/Ui/textarea";
import { ChannelName } from "@/Features/Studio/Tickets/DiscordPickers";
import { formatDate } from "@/Lib/Format";
import { FeedbackSubjectDialog } from "./FeedbackSubjectDialog";

function subjectHref(subjectId: string): Route {
    return `/studio/feedback/${subjectId}` as Route;
}

function SubjectStatus({ subject }: { readonly subject: FeedbackSubjectDto }): ReactNode {
    if (!subject.isActive) {
        return <ToneBadge tone={Tone.Neutral}>Ended</ToneBadge>;
    }
    if (subject.openSurveyId !== null) {
        return <ToneBadge tone={Tone.Info}>Check-in open</ToneBadge>;
    }
    if (subject.channelId === null) {
        return <ToneBadge tone={Tone.Warning}>Needs a channel</ToneBadge>;
    }
    return <ToneBadge tone={Tone.Positive}>Scheduled</ToneBadge>;
}

function SubjectRow({
    subject,
    settings
}: {
    readonly subject: FeedbackSubjectDto;
    readonly settings: FeedbackSettingsDto | undefined;
}): ReactNode {
    const queryClient = useQueryClient();
    const settle = {
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackAll });
        },
        onError: (error: unknown) => {
            toast.error(describeError(error));
        }
    };
    const send = useMutation({
        mutationFn: () => platformApi.sendFeedbackSurvey(subject.id),
        ...settle,
        onSuccess: () => {
            settle.onSuccess();
            toast.success("Check-in sent. The bot posts it in the department channel.");
        }
    });
    const toggle = useMutation({
        mutationFn: () => platformApi.updateFeedbackSubject(subject.id, { isActive: !subject.isActive }),
        ...settle
    });
    const remove = useMutation({ mutationFn: () => platformApi.deleteFeedbackSubject(subject.id), ...settle });
    return (
        <TableRow>
            <TableCell>
                <Link href={subjectHref(subject.id)} className="block">
                    <span className="font-medium hover:underline">{subject.supervisor.username}</span>
                    <span className="text-muted-foreground block text-xs">{subject.title}</span>
                </Link>
            </TableCell>
            <TableCell className="hidden text-xs md:table-cell">
                <ChannelName channelId={subject.channelId} />
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-xs sm:table-cell">{formatDate(subject.startedAt)}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
                {subject.isActive && subject.nextSurveyAt !== null ? <RelativeTime value={subject.nextSurveyAt} /> : "Not scheduled"}
            </TableCell>
            <TableCell className="hidden tabular-nums lg:table-cell">{subject.surveyCount}</TableCell>
            <TableCell>
                <SubjectStatus subject={subject} />
            </TableCell>
            <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                    <FeedbackSubjectDialog
                        subject={subject}
                        settings={settings}
                        trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${subject.supervisor.username}`}>
                                <Pencil />
                            </Button>
                        }
                    />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${subject.supervisor.username}`}>
                                <MoreHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                                <Link href={subjectHref(subject.id)}>View check-ins</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                disabled={
                                    !subject.isActive || subject.openSurveyId !== null || subject.channelId === null || send.isPending
                                }
                                onSelect={() => send.mutate()}
                            >
                                <Send />
                                Send a check-in now
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={toggle.isPending} onSelect={() => toggle.mutate()}>
                                {subject.isActive ? "End reviews (left the role)" : "Resume reviews"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                variant="destructive"
                                disabled={remove.isPending}
                                onSelect={() => {
                                    if (
                                        window.confirm(
                                            `Delete ${subject.supervisor.username} and every check-in result for them? This cannot be undone.`
                                        )
                                    ) {
                                        remove.mutate();
                                    }
                                }}
                            >
                                <Trash2 />
                                Delete with all results
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </TableCell>
        </TableRow>
    );
}

function Supervisors({ settings }: { readonly settings: FeedbackSettingsDto | undefined }): ReactNode {
    const subjectsQuery = useQuery({ queryKey: queryKeys.feedbackSubjects, queryFn: () => platformApi.feedbackSubjects() });
    return (
        <Section
            title="Supervisors"
            actions={
                <FeedbackSubjectDialog
                    settings={settings}
                    trigger={
                        <Button size="sm">
                            <Plus />
                            Supervisor
                        </Button>
                    }
                />
            }
        >
            {subjectsQuery.isPending ? (
                <LoadingRows />
            ) : subjectsQuery.isError ? (
                <ErrorState error={subjectsQuery.error} onRetry={() => void subjectsQuery.refetch()} />
            ) : subjectsQuery.data.length === 0 ? (
                <EmptyState title="No supervisors yet">
                    Add a supervisor, usually from their accepted application, to schedule their crew check-ins.
                </EmptyState>
            ) : (
                <div className="bg-card overflow-hidden rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Supervisor</TableHead>
                                <TableHead className="hidden md:table-cell">Channel</TableHead>
                                <TableHead className="hidden sm:table-cell">Started</TableHead>
                                <TableHead>Next check-in</TableHead>
                                <TableHead className="hidden lg:table-cell">Check-ins</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {subjectsQuery.data.map((subject) => (
                                <SubjectRow key={subject.id} subject={subject} settings={settings} />
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </Section>
    );
}

interface QuestionDraft extends FeedbackQuestionDto {
    readonly key: string;
}

let questionCounter = 0;

function keyed(question: FeedbackQuestionDto): QuestionDraft {
    questionCounter += 1;
    return { ...question, key: `q${questionCounter}` };
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

function Settings({ settings }: { readonly settings: FeedbackSettingsDto }): ReactNode {
    const formId = useId();
    const queryClient = useQueryClient();
    const [questions, setQuestions] = useState<QuestionDraft[]>(() => settings.questions.map(keyed));
    const [firstAfterDays, setFirstAfterDays] = useState(String(settings.firstAfterDays));
    const [intervalDays, setIntervalDays] = useState(String(settings.intervalDays));
    const [openDays, setOpenDays] = useState(String(settings.openDays));
    const [intro, setIntro] = useState(settings.intro);
    const [pingCrew, setPingCrew] = useState(settings.pingCrew);

    useEffect(() => {
        setQuestions(settings.questions.map(keyed));
        setFirstAfterDays(String(settings.firstAfterDays));
        setIntervalDays(String(settings.intervalDays));
        setOpenDays(String(settings.openDays));
        setIntro(settings.intro);
        setPingCrew(settings.pingCrew);
    }, [settings]);

    const inRange = (value: string, maximum: number): boolean => {
        const number = Number(value);
        return Number.isInteger(number) && number >= 1 && number <= maximum;
    };
    const problem =
        questions.length === 0
            ? "Keep at least one question."
            : questions.some((question) => question.label.trim().length === 0)
              ? "Every question needs a label."
              : !inRange(firstAfterDays, feedbackLimits.maximumDays) || !inRange(intervalDays, feedbackLimits.maximumDays)
                ? `Schedule days must be 1 to ${feedbackLimits.maximumDays}.`
                : !inRange(openDays, feedbackLimits.maximumOpenDays)
                  ? `A check-in stays open 1 to ${feedbackLimits.maximumOpenDays} days.`
                  : null;

    const save = useMutation({
        mutationFn: () => {
            const taken = new Set(questions.map((question) => question.id).filter((id) => id.length > 0));
            const cleaned = questions.map(({ key: _key, ...question }) => {
                const id = question.id.length > 0 ? question.id : slugOf(question.label, taken);
                taken.add(id);
                return { ...question, id, label: question.label.trim() };
            });
            return platformApi.updateFeedbackSettings({
                questions: cleaned,
                firstAfterDays: Number(firstAfterDays),
                intervalDays: Number(intervalDays),
                openDays: Number(openDays),
                intro: intro.trim(),
                pingCrew
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackSettings });
            toast.success("Saved. New check-ins use these questions; ones already sent keep theirs.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });

    const updateQuestion = (key: string, patch: Partial<FeedbackQuestionDto>): void =>
        setQuestions((current) => current.map((question) => (question.key === key ? { ...question, ...patch } : question)));
    const move = (index: number, offset: number): void =>
        setQuestions((current) => {
            const next = [...current];
            const [moved] = next.splice(index, 1);
            if (moved !== undefined) {
                next.splice(index + offset, 0, moved);
            }
            return next;
        });

    return (
        <div className="space-y-8">
            <Section title="Questions">
                <div className="space-y-2">
                    {questions.map((question, index) => (
                        <div key={question.key} className="bg-card flex flex-wrap items-center gap-2 rounded-md border p-2">
                            <Input
                                value={question.label}
                                maxLength={feedbackLimits.questionLabel}
                                aria-label={`Question ${index + 1}`}
                                className="min-w-48 flex-1"
                                onChange={(event) => updateQuestion(question.key, { label: event.target.value })}
                            />
                            <Select
                                value={question.kind}
                                onValueChange={(value) => updateQuestion(question.key, { kind: value as FeedbackQuestionKind })}
                            >
                                <SelectTrigger size="sm" className="w-32" aria-label="Answer type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={FeedbackQuestionKind.Rating}>Rating 1–5</SelectItem>
                                    <SelectItem value={FeedbackQuestionKind.Text}>Written</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="flex items-center gap-1.5">
                                <Checkbox
                                    id={`${formId}-${question.key}-required`}
                                    checked={question.required}
                                    onCheckedChange={(checked) => updateQuestion(question.key, { required: checked === true })}
                                />
                                <Label htmlFor={`${formId}-${question.key}-required`} className="text-xs font-normal">
                                    Required
                                </Label>
                            </div>
                            <div className="flex">
                                <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Move up"
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                >
                                    <ArrowUp />
                                </Button>
                                <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Move down"
                                    disabled={index === questions.length - 1}
                                    onClick={() => move(index, 1)}
                                >
                                    <ArrowDown />
                                </Button>
                                <Button
                                    size="icon-xs"
                                    variant="ghost"
                                    aria-label="Remove question"
                                    onClick={() => setQuestions((current) => current.filter((item) => item.key !== question.key))}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={questions.length >= feedbackLimits.questions}
                        onClick={() =>
                            setQuestions((current) => [
                                ...current,
                                keyed({ id: "", label: "", kind: FeedbackQuestionKind.Text, required: false })
                            ])
                        }
                    >
                        <Plus />
                        Question
                    </Button>
                </div>
            </Section>
            <Section title="Schedule and message">
                <div className="bg-card grid gap-4 rounded-md border p-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-first`}>First check-in after (days)</Label>
                        <Input
                            id={`${formId}-first`}
                            type="number"
                            value={firstAfterDays}
                            onChange={(event) => setFirstAfterDays(event.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-interval`}>Then every (days)</Label>
                        <Input
                            id={`${formId}-interval`}
                            type="number"
                            value={intervalDays}
                            onChange={(event) => setIntervalDays(event.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor={`${formId}-open`}>Stays open for (days)</Label>
                        <Input id={`${formId}-open`} type="number" value={openDays} onChange={(event) => setOpenDays(event.target.value)} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                        <Label htmlFor={`${formId}-intro`}>Extra message on the check-in</Label>
                        <Textarea
                            id={`${formId}-intro`}
                            rows={3}
                            value={intro}
                            maxLength={feedbackLimits.intro}
                            placeholder="Optional. The check-in already explains that answers are optional, anonymous and only read by leadership."
                            onChange={(event) => setIntro(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-3">
                        <Checkbox id={`${formId}-ping`} checked={pingCrew} onCheckedChange={(checked) => setPingCrew(checked === true)} />
                        <Label htmlFor={`${formId}-ping`} className="font-normal">
                            Ping the crew roles when a check-in opens
                        </Label>
                    </div>
                    <p className="text-muted-foreground text-xs sm:col-span-3">
                        New supervisors start from these days. Change a supervisor&apos;s own schedule from their row.
                    </p>
                </div>
            </Section>
            <div className="flex items-center justify-end gap-3">
                {problem !== null && <p className="text-destructive text-xs">{problem}</p>}
                <Button disabled={problem !== null || save.isPending} onClick={() => save.mutate()}>
                    Save
                </Button>
            </div>
        </div>
    );
}

function FeedbackContent(): ReactNode {
    const settingsQuery = useQuery({ queryKey: queryKeys.feedbackSettings, queryFn: () => platformApi.feedbackSettings() });
    return (
        <Tabs defaultValue="supervisors">
            <TabsList>
                <TabsTrigger value="supervisors">Supervisors</TabsTrigger>
                <TabsTrigger value="settings">Questions and schedule</TabsTrigger>
            </TabsList>
            <TabsContent value="supervisors" className="pt-2">
                <Supervisors settings={settingsQuery.data} />
            </TabsContent>
            <TabsContent value="settings" className="pt-2">
                {settingsQuery.isPending ? (
                    <LoadingRows />
                ) : settingsQuery.isError ? (
                    <ErrorState error={settingsQuery.error} onRetry={() => void settingsQuery.refetch()} />
                ) : (
                    <Settings settings={settingsQuery.data} />
                )}
            </TabsContent>
        </Tabs>
    );
}

export function FeedbackPage(): ReactNode {
    return (
        <RequireRole role={Role.Admin}>
            <PageHeader title="Crew feedback" />
            <FeedbackContent />
        </RequireRole>
    );
}
