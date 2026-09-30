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
                <p className="min-w-0 truncate text-sm">
                    <span className="text-muted-foreground">Step {progress.stepId}</span> {progress.stepTitle}
                </p>
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
            toast.success(`The roadmap now shows step ${updated.stepId}, ${updated.stepTitle}.`);
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
                    <Label htmlFor="roadmap-step">Current step</Label>
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
                                                {item.id} {item.title}
                                            </SelectItem>
                                        ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <ConfirmButton
                    title={`Move to ${step.id}, ${step.title}?`}
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
    return (
        <ol className="space-y-10">
            {pipelinePhases.map((phase) => {
                const steps = pipelineSteps.filter((step) => step.phaseNumber === phase.number);
                const first = steps[0]?.index ?? 0;
                const last = steps.at(-1)?.index ?? 0;
                const phaseState = currentIndex > last ? "done" : currentIndex >= first ? "current" : "upcoming";
                return (
                    <li key={phase.number} className="grid gap-4 md:grid-cols-[14rem_1fr]">
                        <div className="space-y-1">
                            <p className="text-muted-foreground text-xs tracking-wider uppercase">Phase {phase.number}</p>
                            <h2 className={cn("text-sm font-semibold", phaseState === "upcoming" && "text-muted-foreground")}>
                                {phase.title.replace(/^Phase \d+: /u, "")}
                            </h2>
                            <p className="text-muted-foreground text-xs">
                                {phaseState === "done" ? "Complete" : phaseState === "current" ? "In progress" : "Coming up"}
                            </p>
                        </div>
                        <ol className="border-border relative space-y-4 border-l pl-6">
                            {steps.map((step) => {
                                const isDone = step.index < currentIndex;
                                const isCurrent = step.index === currentIndex;
                                return (
                                    <li key={step.id} className="relative" aria-current={isCurrent ? "step" : undefined}>
                                        <span
                                            className={cn(
                                                "bg-background absolute top-0.5 -left-[1.95rem] flex size-4 items-center justify-center rounded-full border",
                                                isDone && "bg-foreground border-foreground text-background",
                                                isCurrent && "border-foreground ring-foreground/20 ring-4"
                                            )}
                                            aria-hidden="true"
                                        >
                                            {isDone && <Check className="size-3" />}
                                        </span>
                                        <p
                                            className={cn(
                                                "text-sm",
                                                isCurrent && "font-semibold",
                                                !isDone && !isCurrent && "text-muted-foreground"
                                            )}
                                        >
                                            <span className="text-muted-foreground mr-2 tabular-nums">{step.id}</span>
                                            {step.title}
                                            {isCurrent && <span className="text-muted-foreground ml-2 text-xs font-normal">now</span>}
                                        </p>
                                        <p className="text-muted-foreground text-xs text-pretty">{step.description}</p>
                                    </li>
                                );
                            })}
                        </ol>
                    </li>
                );
            })}
        </ol>
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
                    {!isLoading && hasAtLeast(user, Role.Supervisor) && <UpdateProgress key={pipeline.data.stepIndex} progress={pipeline.data} />}
                    <Timeline currentIndex={pipeline.data.stepIndex} />
                </div>
            )}
        </>
    );
}
