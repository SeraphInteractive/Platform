"use client";

import {
    defaultAcknowledgement,
    FeedbackOutcome,
    feedbackLimits,
    feedbackOutcomeLabels,
    FeedbackSurveyStatus,
    ratingLabels,
    Role,
    type FeedbackSurveyDetailDto,
    type FeedbackSurveyDto
} from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { MarkdownText } from "@/Components/Common/MarkdownText";
import { EmptyState, ErrorState, LoadingRows, RequireRole } from "@/Components/Common/States";
import { Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Label } from "@/Components/Ui/label";
import { RadioGroup, RadioGroupItem } from "@/Components/Ui/radio-group";
import { Textarea } from "@/Components/Ui/textarea";
import { formatDate, formatDateTime } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

const outcomeTones: Readonly<Record<FeedbackOutcome, Tone>> = {
    [FeedbackOutcome.NoAction]: Tone.Neutral,
    [FeedbackOutcome.Acknowledged]: Tone.Positive,
    [FeedbackOutcome.Mitigation]: Tone.Warning
};

function SurveyBadge({ survey }: { readonly survey: FeedbackSurveyDto }): ReactNode {
    if (survey.status === FeedbackSurveyStatus.Open) {
        return <ToneBadge tone={Tone.Info}>Open</ToneBadge>;
    }
    if (survey.outcome === null) {
        return <ToneBadge tone={Tone.Warning}>Needs a decision</ToneBadge>;
    }
    return <ToneBadge tone={outcomeTones[survey.outcome]}>{feedbackOutcomeLabels[survey.outcome]}</ToneBadge>;
}

function RatingBar({ rating }: { readonly rating: FeedbackSurveyDetailDto["ratings"][number] }): ReactNode {
    const max = Math.max(1, ...rating.distribution);
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{rating.label}</p>
                <p className="shrink-0 text-sm tabular-nums">
                    {rating.average === null ? "No ratings" : <span className="text-lg font-semibold">{rating.average.toFixed(1)}</span>}
                    <span className="text-muted-foreground text-xs"> / 5 | {rating.count}</span>
                </p>
            </div>
            <div className="space-y-1">
                {[...rating.distribution]
                    .map((count, index) => ({ count, score: index + 1 }))
                    .reverse()
                    .map(({ count, score }) => (
                        <div key={score} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-24 shrink-0">
                                {score} | {ratingLabels[score]}
                            </span>
                            <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                                <div className="bg-primary h-full rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                            </div>
                            <span className="text-muted-foreground w-5 text-right tabular-nums">{count}</span>
                        </div>
                    ))}
            </div>
        </div>
    );
}

function OutcomeForm({ survey }: { readonly survey: FeedbackSurveyDetailDto }): ReactNode {
    const queryClient = useQueryClient();
    const [outcome, setOutcome] = useState<FeedbackOutcome>(FeedbackOutcome.NoAction);
    const [acknowledgement, setAcknowledgement] = useState(defaultAcknowledgement);
    const [steps, setSteps] = useState("");
    const [note, setNote] = useState("");
    const message =
        outcome === FeedbackOutcome.Mitigation ? steps.trim() : outcome === FeedbackOutcome.Acknowledged ? acknowledgement.trim() : "";
    const problem = outcome === FeedbackOutcome.Mitigation && message.length === 0 ? "Write the action steps to send." : null;
    const record = useMutation({
        mutationFn: () =>
            platformApi.recordFeedbackOutcome(survey.id, {
                outcome,
                message: message.length === 0 ? null : message,
                internalNote: note.trim().length === 0 ? null : note.trim()
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackAll });
            toast.success(
                message.length === 0 ? "Outcome recorded." : `Outcome recorded. ${survey.supervisor.username} gets your message by DM.`
            );
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    return (
        <section className="bg-card space-y-4 rounded-md border p-4">
            <div>
                <h2 className="text-sm font-semibold">Decide what happens next</h2>
                <p className="text-muted-foreground text-xs">
                    Only the message you write is sent. Scores and answers are never shared with the supervisor.
                </p>
            </div>
            <RadioGroup
                value={outcome}
                onValueChange={(value) => setOutcome(value as FeedbackOutcome)}
                className="grid gap-2 sm:grid-cols-3"
            >
                {[
                    { value: FeedbackOutcome.NoAction, title: "No action", body: "Nothing is sent." },
                    { value: FeedbackOutcome.Acknowledged, title: "Say good job", body: "Send a short note of thanks." },
                    { value: FeedbackOutcome.Mitigation, title: "Mitigation", body: "Send actionable steps to work on." }
                ].map((option) => (
                    <Label
                        key={option.value}
                        className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-md border p-3 font-normal",
                            outcome === option.value && "border-primary"
                        )}
                    >
                        <RadioGroupItem value={option.value} className="mt-0.5" />
                        <span>
                            <span className="block font-medium">{option.title}</span>
                            <span className="text-muted-foreground text-xs">{option.body}</span>
                        </span>
                    </Label>
                ))}
            </RadioGroup>
            {outcome === FeedbackOutcome.Acknowledged && (
                <Textarea
                    rows={3}
                    value={acknowledgement}
                    maxLength={feedbackLimits.outcomeMessage}
                    aria-label="Message to the supervisor"
                    onChange={(event) => setAcknowledgement(event.target.value)}
                />
            )}
            {outcome === FeedbackOutcome.Mitigation && (
                <Textarea
                    rows={6}
                    value={steps}
                    maxLength={feedbackLimits.outcomeMessage}
                    placeholder={
                        "Actionable steps for the supervisor, for example:\n1. Post weekly deadlines in the department channel.\n2. Hold a short check-in with each crew member this month."
                    }
                    aria-label="Action steps for the supervisor"
                    onChange={(event) => setSteps(event.target.value)}
                />
            )}
            <div className="space-y-1.5">
                <Label htmlFor={`note-${survey.id}`}>Leadership note (private)</Label>
                <Textarea
                    id={`note-${survey.id}`}
                    rows={2}
                    value={note}
                    maxLength={feedbackLimits.internalNote}
                    placeholder="Why this decision was made. Only leadership sees this."
                    onChange={(event) => setNote(event.target.value)}
                />
            </div>
            <div className="flex items-center justify-end gap-3">
                {problem !== null && <p className="text-destructive text-xs">{problem}</p>}
                <ConfirmButton
                    title="Record this outcome?"
                    description={
                        message.length === 0
                            ? "This check-in will be marked as reviewed. Nothing is sent."
                            : `${survey.supervisor.username} receives your message by DM. Outcomes cannot be changed afterwards.`
                    }
                    confirmLabel="Record"
                    variant="default"
                    disabled={problem !== null || record.isPending}
                    onConfirm={() => record.mutate()}
                >
                    Record outcome
                </ConfirmButton>
            </div>
        </section>
    );
}

function Results({ surveyId }: { readonly surveyId: string }): ReactNode {
    const queryClient = useQueryClient();
    const resultsQuery = useQuery({
        queryKey: queryKeys.feedbackResults(surveyId),
        queryFn: () => platformApi.feedbackResults(surveyId),
        refetchInterval: 30_000
    });
    const close = useMutation({
        mutationFn: () => platformApi.closeFeedbackSurvey(surveyId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackAll });
            toast.success("Check-in closed.");
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
    if (resultsQuery.isPending) {
        return <LoadingRows rows={6} />;
    }
    if (resultsQuery.isError) {
        return <ErrorState error={resultsQuery.error} onRetry={() => void resultsQuery.refetch()} />;
    }
    const survey = resultsQuery.data;
    const isOpen = survey.status === FeedbackSurveyStatus.Open;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">Check-in #{survey.sequence}</h2>
                    <p className="text-muted-foreground text-xs">
                        {formatDateTime(survey.opensAt)} to {formatDateTime(survey.closedAt ?? survey.closesAt)} | {survey.responseCount}{" "}
                        {survey.responseCount === 1 ? "response" : "responses"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <SurveyBadge survey={survey} />
                    {isOpen && (
                        <ConfirmButton
                            title="Close this check-in early?"
                            description="The crew can no longer answer. You can then record an outcome."
                            confirmLabel="Close"
                            onConfirm={() => close.mutate()}
                            disabled={close.isPending}
                        >
                            <Lock />
                            Close now
                        </ConfirmButton>
                    )}
                </div>
            </div>
            {survey.responseCount === 0 ? (
                <EmptyState title={isOpen ? "No answers yet" : "Nobody answered"}>
                    {isOpen ? "Answers appear here as the crew responds." : "The check-in was optional and nobody took part this time."}
                </EmptyState>
            ) : (
                <>
                    {survey.ratings.length > 0 && (
                        <section className="bg-card grid gap-5 rounded-md border p-4 md:grid-cols-2">
                            {survey.ratings.map((rating) => (
                                <RatingBar key={rating.questionId} rating={rating} />
                            ))}
                        </section>
                    )}
                    {survey.comments.map((comment) => (
                        <section key={comment.questionId} className="bg-card space-y-2 rounded-md border p-4">
                            <h3 className="text-sm font-medium">{comment.label}</h3>
                            {comment.answers.length === 0 ? (
                                <p className="text-muted-foreground text-sm">No written answers.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {comment.answers.map((answer, index) => (
                                        <li key={index} className="bg-muted/40 rounded-md px-3 py-2 text-sm whitespace-pre-wrap">
                                            {answer}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    ))}
                    <p className="text-muted-foreground text-xs">
                        Written answers are shown in random order and are not linked to who wrote them.
                    </p>
                </>
            )}
            {!isOpen && survey.outcome === null && <OutcomeForm survey={survey} />}
            {survey.outcome !== null && (
                <section className="bg-card space-y-2 rounded-md border p-4">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="text-muted-foreground size-4" />
                        <h2 className="text-sm font-semibold">{feedbackOutcomeLabels[survey.outcome]}</h2>
                        <span className="text-muted-foreground text-xs">
                            by {survey.outcomeBy?.username ?? "leadership"}
                            {survey.outcomeAt !== null && <> | {formatDateTime(survey.outcomeAt)}</>}
                        </span>
                    </div>
                    {survey.outcomeMessage !== null && (
                        <div className="space-y-1">
                            <p className="text-muted-foreground text-xs">Sent to {survey.supervisor.username}</p>
                            <MarkdownText className="text-sm">{survey.outcomeMessage}</MarkdownText>
                        </div>
                    )}
                    {survey.internalNote !== null && (
                        <div className="space-y-1">
                            <p className="text-muted-foreground text-xs">Leadership note</p>
                            <p className="text-sm whitespace-pre-wrap">{survey.internalNote}</p>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}

function SubjectContent({ subjectId }: { readonly subjectId: string }): ReactNode {
    const subjectsQuery = useQuery({ queryKey: queryKeys.feedbackSubjects, queryFn: () => platformApi.feedbackSubjects() });
    const surveysQuery = useQuery({
        queryKey: queryKeys.feedbackSurveys(subjectId),
        queryFn: () => platformApi.feedbackSurveys(subjectId)
    });
    const [selected, setSelected] = useState<string | null>(null);
    if (subjectsQuery.isPending || surveysQuery.isPending) {
        return <LoadingRows rows={6} />;
    }
    if (subjectsQuery.isError || surveysQuery.isError) {
        return <ErrorState error={subjectsQuery.error ?? surveysQuery.error} />;
    }
    const subject = subjectsQuery.data.find((candidate) => candidate.id === subjectId);
    if (subject === undefined) {
        return <EmptyState title="Supervisor not found" />;
    }
    const surveys = surveysQuery.data;
    const active = selected ?? surveys[0]?.id ?? null;
    return (
        <div>
            <Link
                href={"/studio/feedback" as Route}
                className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
            >
                <ArrowLeft className="size-3.5" />
                Crew feedback
            </Link>
            <div className="mb-4 space-y-1">
                <p className="text-muted-foreground text-xs tracking-wider uppercase">{subject.title}</p>
                <h1 className="text-lg font-semibold">{subject.supervisor.username}</h1>
                <p className="text-muted-foreground text-xs">
                    Since {formatDate(subject.startedAt)} | first check-in after {subject.firstAfterDays} days, then every{" "}
                    {subject.intervalDays} days
                    {!subject.isActive && subject.endedAt !== null && <> | ended {formatDate(subject.endedAt)}</>}
                </p>
            </div>
            {surveys.length === 0 ? (
                <EmptyState title="No check-ins yet">
                    {subject.nextSurveyAt === null
                        ? "Reviews have ended."
                        : `The first check-in goes out ${formatDateTime(subject.nextSurveyAt)}.`}
                </EmptyState>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
                    <nav className="bg-card h-fit divide-y overflow-hidden rounded-md border" aria-label="Check-ins">
                        {surveys.map((survey) => (
                            <button
                                key={survey.id}
                                type="button"
                                onClick={() => setSelected(survey.id)}
                                className={cn(
                                    "hover:bg-muted/50 flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left",
                                    survey.id === active && "bg-muted"
                                )}
                            >
                                <span className="text-sm font-medium">Check-in #{survey.sequence}</span>
                                <span className="text-muted-foreground text-xs">
                                    {formatDate(survey.opensAt)} | {survey.responseCount}{" "}
                                    {survey.responseCount === 1 ? "response" : "responses"}
                                </span>
                                <SurveyBadge survey={survey} />
                            </button>
                        ))}
                    </nav>
                    {active !== null && <Results key={active} surveyId={active} />}
                </div>
            )}
        </div>
    );
}

export function FeedbackSubjectView({ subjectId }: { readonly subjectId: string }): ReactNode {
    return (
        <RequireRole role={Role.Admin}>
            <SubjectContent subjectId={subjectId} />
        </RequireRole>
    );
}
