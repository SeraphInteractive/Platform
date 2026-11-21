"use client";

import { Role, type PipelineProgressDto } from "@platform/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { platformApi, type PipelineUpdateInput } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { ConfirmButton } from "@/Components/Common/ConfirmButton";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { ErrorState, LoadingRows } from "@/Components/Common/States";
import { Badge } from "@/Components/Ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/Components/Ui/card";
import { Label } from "@/Components/Ui/label";
import { Progress } from "@/Components/Ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { useSession } from "@/Hooks/UseSession";
import { pipelinePhases, pipelineSteps, progressPercentFor } from "@/Lib/Pipeline";
import { hasAtLeast } from "@/Lib/Roles";
import { cn } from "@/Lib/Utils";

export function PipelineSummary({ progress }: { readonly progress: PipelineProgressDto }): ReactNode {
    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">{progress.stepTitle}</p>
                <span className="shrink-0 text-sm tabular-nums">{Math.round(progress.progressPercent)}%</span>
            </div>
            <Progress value={progress.progressPercent} aria-label="Overall production progress" />
            <p className="text-muted-foreground text-xs">{progress.phaseTitle}</p>
        </div>
    );
}

function UpdateProgress({ progress }: { readonly progress: PipelineProgressDto }): ReactNode {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState(String(progress.stepIndex));
    const step = pipelineSteps[Number(selected)];
    const currentPhase = pipelineSteps[progress.stepIndex]?.phaseNumber ?? progress.phaseNumber;
    const update = useMutation({
        mutationFn: (input: PipelineUpdateInput) => platformApi.updatePipeline(input),
        onSuccess: (updated) => {
            queryClient.setQueryData(queryKeys.pipeline, updated);
            toast.success(`The roadmap now shows ${updated.stepTitle}.`);
        }
    });
    if (!hasAtLeast(user, Role.Supervisor) || step === undefined) {
        return null;
    }
    const isPhaseTransition = step.phaseNumber !== currentPhase && step.index > progress.stepIndex;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">Move the roadmap</CardTitle>
                <CardDescription>Supervisors only. Every move is announced in the Discord announcements channel.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                    <Label htmlFor="roadmap-step">Current milestone</Label>
                    <Select value={selected} onValueChange={setSelected}>
                        <SelectTrigger id="roadmap-step" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pipelinePhases.map((phase) => (
                                <SelectGroup key={phase.number}>
                                    <SelectLabel>{phase.title}</SelectLabel>
                                    {pipelineSteps
                                        .filter((item) => item.phaseNumber === phase.number)
                                        .map((item) => (
                                            <SelectItem key={item.id} value={String(item.index)}>
                                                {item.title}
                                            </SelectItem>
                                        ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <ConfirmButton
                    title={`Move to ${step.title}?`}
                    description={
                        isPhaseTransition
                            ? `This unlocks ${step.phaseTitle} and pings the announcements channel with a phase unlock.`
                            : "The public roadmap updates and a short progress note is posted on Discord."
                    }
                    confirmLabel="Move roadmap"
                    variant="default"
                    disabled={update.isPending || step.index === progress.stepIndex}
                    onConfirm={() => {
                        update.mutate({
                            stepIndex: step.index,
                            stepId: step.id,
                            stepTitle: step.title,
                            phaseNumber: step.phaseNumber,
                            phaseTitle: step.phaseTitle,
                            progressPercent: progressPercentFor(step.index),
                            isPhaseTransition
                        });
                    }}
                >
                    Move roadmap
                </ConfirmButton>
            </CardContent>
        </Card>
    );
}

function Timeline({ currentIndex }: { readonly currentIndex: number }): ReactNode {
    const mainPhases = pipelinePhases.filter((phase) => phase.number < 7);
    const finaleSteps = pipelineSteps.filter((step) => step.phaseNumber === 7);
    const marketingStep = finaleSteps[0];
    const releaseStep = finaleSteps[1];

    const isMarketingDone = marketingStep !== undefined && marketingStep.index < currentIndex;
    const isMarketingCurrent = marketingStep !== undefined && marketingStep.index === currentIndex;
    const isReleaseDone = releaseStep !== undefined && releaseStep.index < currentIndex;
    const isReleaseCurrent = releaseStep !== undefined && releaseStep.index === currentIndex;

    return (
        <div className="relative mx-auto w-full max-w-4xl space-y-10 py-2">
            {mainPhases.map((phase) => {
                const steps = pipelineSteps.filter((step) => step.phaseNumber === phase.number);
                const first = steps[0]?.index ?? 0;
                const last = steps.at(-1)?.index ?? 0;
                const phaseState = currentIndex > last ? "done" : currentIndex >= first ? "current" : "upcoming";

                return (
                    <section key={phase.number} aria-label={phase.title} className="relative space-y-6">
                        {/* clean grounded phase divider */}
                        <div className="relative flex items-center justify-center py-2">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex items-center gap-2.5 bg-background px-4 text-center">
                                <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                                    Phase {phase.number}
                                </span>
                                <span className="text-muted-foreground/40 text-xs" aria-hidden="true">
                                    ·
                                </span>
                                <span className="text-foreground text-sm font-semibold">{phase.title.replace(/^Phase \d+: /u, "")}</span>
                                <Badge variant={phaseState === "current" ? "default" : "outline"} className="text-[11px] font-normal">
                                    {phaseState === "done" ? "Complete" : phaseState === "current" ? "In progress" : "Upcoming"}
                                </Badge>
                            </div>
                        </div>

                        {/* alternating diamond milestone snake track */}
                        <ol className="relative space-y-4 md:space-y-6">
                            {steps.map((step, idx) => {
                                const isDone = step.index < currentIndex;
                                const isCurrent = step.index === currentIndex;
                                const isLeft = idx % 2 === 0;

                                return (
                                    <li
                                        key={step.id}
                                        aria-current={isCurrent ? "step" : undefined}
                                        className="relative grid grid-cols-[2rem_1fr] items-center gap-3 md:grid-cols-[1fr_3.5rem_1fr] md:gap-4"
                                    >
                                        {/* left card slot */}
                                        {isLeft ? (
                                            <div className="col-start-2 md:col-start-1 md:row-start-1">
                                                <div
                                                    className={cn(
                                                        "rounded-md border p-3.5 transition-colors",
                                                        isCurrent
                                                            ? "border-primary/60 bg-card ring-1 ring-primary/20"
                                                            : isDone
                                                              ? "border-border bg-card hover:border-border/80"
                                                              : "border-border/60 bg-card/40 opacity-70"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h3
                                                            className={cn(
                                                                "text-[13px] font-medium leading-snug",
                                                                isCurrent
                                                                    ? "text-foreground font-semibold"
                                                                    : isDone
                                                                      ? "text-foreground"
                                                                      : "text-muted-foreground"
                                                            )}
                                                        >
                                                            {step.title}
                                                        </h3>
                                                        {isDone ? (
                                                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                <Check className="text-primary size-3" /> Done
                                                            </span>
                                                        ) : isCurrent ? (
                                                            <Badge variant="secondary" className="text-primary text-[10px] font-normal">
                                                                Current
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                    <p className="text-muted-foreground mt-1 text-xs text-pretty leading-relaxed">
                                                        {step.description}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="hidden md:block md:col-start-1 md:row-start-1" aria-hidden="true" />
                                        )}

                                        {/* center diamond rail node */}
                                        <div className="col-start-1 flex h-full flex-col items-center justify-center md:col-start-2 md:row-start-1">
                                            {/* top vertical rail */}
                                            <div
                                                className={cn(
                                                    "w-[2px] flex-1",
                                                    isDone || isCurrent ? "bg-primary" : "border-border border-l border-dashed"
                                                )}
                                                aria-hidden="true"
                                            />

                                            {/* diamond milestone node */}
                                            <div className="relative my-1.5 flex items-center justify-center">
                                                {/* horizontal connector arm */}
                                                <div
                                                    className={cn(
                                                        "absolute top-1/2 h-[1px] -translate-y-1/2",
                                                        // on mobile, always extend right to card
                                                        "left-1/2 w-3 md:left-auto",
                                                        // on desktop, extend left or right based on card position
                                                        isLeft ? "md:right-1/2 md:w-7" : "md:left-1/2 md:w-7",
                                                        isDone || isCurrent ? "bg-primary/40" : "border-border border-t border-dashed"
                                                    )}
                                                    aria-hidden="true"
                                                />

                                                {/* diamond marker */}
                                                <span
                                                    className={cn(
                                                        "relative z-10 flex size-5.5 rotate-45 items-center justify-center rounded-[2px] border transition-colors sm:size-6",
                                                        isDone && "border-primary bg-primary text-primary-foreground",
                                                        isCurrent &&
                                                            "border-primary bg-background text-primary ring-2 ring-primary/20 border-2",
                                                        !isDone && !isCurrent && "border-border bg-card text-muted-foreground/40"
                                                    )}
                                                    aria-hidden="true"
                                                >
                                                    {isDone ? (
                                                        <Check className="-rotate-45 size-3 stroke-[2.5]" />
                                                    ) : isCurrent ? (
                                                        <div className="bg-primary size-1.5 rounded-[1px]" />
                                                    ) : (
                                                        <div className="bg-muted-foreground/30 size-1 rounded-[0.5px]" />
                                                    )}
                                                </span>
                                            </div>

                                            {/* bottom vertical rail */}
                                            <div
                                                className={cn(
                                                    "w-[2px] flex-1",
                                                    isDone ? "bg-primary" : "border-border border-l border-dashed"
                                                )}
                                                aria-hidden="true"
                                            />
                                        </div>

                                        {/* right card slot */}
                                        {!isLeft ? (
                                            <div className="col-start-2 md:col-start-3 md:row-start-1">
                                                <div
                                                    className={cn(
                                                        "rounded-md border p-3.5 transition-colors",
                                                        isCurrent
                                                            ? "border-primary/60 bg-card ring-1 ring-primary/20"
                                                            : isDone
                                                              ? "border-border bg-card hover:border-border/80"
                                                              : "border-border/60 bg-card/40 opacity-70"
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h3
                                                            className={cn(
                                                                "text-[13px] font-medium leading-snug",
                                                                isCurrent
                                                                    ? "text-foreground font-semibold"
                                                                    : isDone
                                                                      ? "text-foreground"
                                                                      : "text-muted-foreground"
                                                            )}
                                                        >
                                                            {step.title}
                                                        </h3>
                                                        {isDone ? (
                                                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                <Check className="text-primary size-3" /> Done
                                                            </span>
                                                        ) : isCurrent ? (
                                                            <Badge variant="secondary" className="text-primary text-[10px] font-normal">
                                                                Current
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                    <p className="text-muted-foreground mt-1 text-xs text-pretty leading-relaxed">
                                                        {step.description}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="hidden md:block md:col-start-3 md:row-start-1" aria-hidden="true" />
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                );
            })}

            {/* centered finale milestones: Marketing & Release */}
            {marketingStep !== undefined && releaseStep !== undefined && (
                <div className="relative flex flex-col items-center">
                    {/* vertical rail continuing from phase 6 */}
                    <div
                        className={cn(
                            "h-10 w-[2px]",
                            isMarketingDone || isMarketingCurrent ? "bg-primary" : "border-border border-l border-dashed"
                        )}
                        aria-hidden="true"
                    />

                    {/* Marketing milestone */}
                    <div className="relative flex w-full flex-col items-center">
                        <div className="relative my-2 flex items-center justify-center">
                            <span
                                className={cn(
                                    "relative z-10 flex size-5.5 rotate-45 items-center justify-center rounded-[2px] border transition-colors sm:size-6",
                                    isMarketingDone && "border-primary bg-primary text-primary-foreground",
                                    isMarketingCurrent && "border-primary bg-background text-primary ring-2 ring-primary/20 border-2",
                                    !isMarketingDone && !isMarketingCurrent && "border-border bg-card text-muted-foreground/40"
                                )}
                                aria-hidden="true"
                            >
                                {isMarketingDone ? (
                                    <Check className="-rotate-45 size-3 stroke-[2.5]" />
                                ) : isMarketingCurrent ? (
                                    <div className="bg-primary size-1.5 rounded-[1px]" />
                                ) : (
                                    <div className="bg-muted-foreground/30 size-1 rounded-[0.5px]" />
                                )}
                            </span>
                        </div>

                        <div
                            className={cn(
                                "h-3 w-[2px]",
                                isMarketingDone || isMarketingCurrent ? "bg-primary" : "border-border border-l border-dashed"
                            )}
                            aria-hidden="true"
                        />

                        <div
                            className={cn(
                                "w-full max-w-sm rounded-md border p-3.5 text-center transition-colors sm:max-w-md",
                                isMarketingCurrent
                                    ? "border-primary/60 bg-card ring-1 ring-primary/20"
                                    : isMarketingDone
                                      ? "border-border bg-card hover:border-border/80"
                                      : "border-border/60 bg-card/40 opacity-70"
                            )}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <h3
                                    className={cn(
                                        "text-[13px] font-medium leading-snug",
                                        isMarketingCurrent
                                            ? "text-foreground font-semibold"
                                            : isMarketingDone
                                              ? "text-foreground"
                                              : "text-muted-foreground"
                                    )}
                                >
                                    {marketingStep.title}
                                </h3>
                                {isMarketingDone ? (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Check className="text-primary size-3" /> Done
                                    </span>
                                ) : isMarketingCurrent ? (
                                    <Badge variant="secondary" className="text-primary text-[10px] font-normal">
                                        Current
                                    </Badge>
                                ) : null}
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs text-pretty leading-relaxed">{marketingStep.description}</p>
                        </div>
                    </div>

                    {/* vertical rail between Marketing and Release */}
                    <div
                        className={cn(
                            "h-10 w-[2px]",
                            isReleaseDone || isReleaseCurrent ? "bg-primary" : "border-border border-l border-dashed"
                        )}
                        aria-hidden="true"
                    />

                    {/* Release milestone */}
                    <div className="relative flex w-full flex-col items-center">
                        <div className="relative my-2 flex items-center justify-center">
                            <span
                                className={cn(
                                    "relative z-10 flex size-5.5 rotate-45 items-center justify-center rounded-[2px] border transition-colors sm:size-6",
                                    isReleaseDone && "border-primary bg-primary text-primary-foreground",
                                    isReleaseCurrent && "border-primary bg-background text-primary ring-2 ring-primary/20 border-2",
                                    !isReleaseDone && !isReleaseCurrent && "border-border bg-card text-muted-foreground/40"
                                )}
                                aria-hidden="true"
                            >
                                {isReleaseDone ? (
                                    <Check className="-rotate-45 size-3 stroke-[2.5]" />
                                ) : isReleaseCurrent ? (
                                    <div className="bg-primary size-1.5 rounded-[1px]" />
                                ) : (
                                    <div className="bg-muted-foreground/30 size-1 rounded-[0.5px]" />
                                )}
                            </span>
                        </div>

                        <div
                            className={cn(
                                "h-3 w-[2px]",
                                isReleaseDone || isReleaseCurrent ? "bg-primary" : "border-border border-l border-dashed"
                            )}
                            aria-hidden="true"
                        />

                        <div
                            className={cn(
                                "w-full max-w-sm rounded-md border p-3.5 text-center transition-colors sm:max-w-md",
                                isReleaseCurrent
                                    ? "border-primary/60 bg-card ring-1 ring-primary/20"
                                    : isReleaseDone
                                      ? "border-border bg-card hover:border-border/80"
                                      : "border-border/60 bg-card/40 opacity-70"
                            )}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <h3
                                    className={cn(
                                        "text-[13px] font-medium leading-snug",
                                        isReleaseCurrent
                                            ? "text-foreground font-semibold"
                                            : isReleaseDone
                                              ? "text-foreground"
                                              : "text-muted-foreground"
                                    )}
                                >
                                    {releaseStep.title}
                                </h3>
                                {isReleaseDone ? (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Check className="text-primary size-3" /> Done
                                    </span>
                                ) : isReleaseCurrent ? (
                                    <Badge variant="secondary" className="text-primary text-[10px] font-normal">
                                        Current
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="border-border text-muted-foreground text-[10px] font-normal">
                                        YouTube Premiere
                                    </Badge>
                                )}
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs text-pretty leading-relaxed">{releaseStep.description}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function RoadmapView(): ReactNode {
    const { user, isLoading } = useSession();
    const pipeline = useQuery({ queryKey: queryKeys.pipeline, queryFn: () => platformApi.pipeline() });

    return (
        <>
            <PageHeader title="Roadmap" />
            {pipeline.isPending ? (
                <LoadingRows rows={6} />
            ) : pipeline.isError ? (
                <ErrorState error={pipeline.error} onRetry={() => void pipeline.refetch()} />
            ) : (
                <div className="space-y-10">
                    <Card>
                        <CardContent className="space-y-2">
                            <PipelineSummary progress={pipeline.data} />
                            {pipeline.data.updatedAt !== null && (
                                <p className="text-muted-foreground text-xs">
                                    Updated <RelativeTime value={pipeline.data.updatedAt} />
                                </p>
                            )}
                        </CardContent>
                    </Card>
                    {!isLoading && hasAtLeast(user, Role.Supervisor) && (
                        <UpdateProgress key={pipeline.data.stepIndex} progress={pipeline.data} />
                    )}
                    <Timeline currentIndex={pipeline.data.stepIndex} />
                </div>
            )}
        </>
    );
}
