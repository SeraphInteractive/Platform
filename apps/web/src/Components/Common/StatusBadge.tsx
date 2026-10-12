import { EntryStatus, RoundStatus, ShotStatus, SubmissionStatus } from "@platform/contracts";
import type { ReactNode } from "react";
import { Badge } from "@/Components/Ui/badge";
import { entryStatusLabels, roundStatusLabels, shotStatusLabels, submissionStatusLabels } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

export enum Tone {
    Neutral = "neutral",
    Positive = "positive",
    Warning = "warning",
    Negative = "negative",
    Info = "info"
}

const toneClasses: Readonly<Record<Tone, string>> = {
    [Tone.Neutral]: "bg-muted text-muted-foreground",
    [Tone.Positive]: "bg-success/15 text-success",
    [Tone.Warning]: "bg-warning/15 text-warning",
    [Tone.Negative]: "bg-destructive/12 text-destructive",
    [Tone.Info]: "bg-primary/12 text-primary"
};

export function ToneBadge({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }): ReactNode {
    return (
        <Badge variant="secondary" className={cn("h-5 rounded-sm border-0 px-1.5 text-[11px] font-medium", toneClasses[tone])}>
            {children}
        </Badge>
    );
}

const roundTones: Readonly<Record<RoundStatus, Tone>> = {
    [RoundStatus.Draft]: Tone.Neutral,
    [RoundStatus.Open]: Tone.Info,
    [RoundStatus.Voting]: Tone.Positive,
    [RoundStatus.Finalized]: Tone.Neutral
};

const entryTones: Readonly<Record<EntryStatus, Tone>> = {
    [EntryStatus.PendingReview]: Tone.Warning,
    [EntryStatus.Approved]: Tone.Positive,
    [EntryStatus.Rejected]: Tone.Negative,
    [EntryStatus.Flagged]: Tone.Negative
};

const shotTones: Readonly<Record<ShotStatus, Tone>> = {
    [ShotStatus.Available]: Tone.Positive,
    [ShotStatus.Claimed]: Tone.Info,
    [ShotStatus.Submitted]: Tone.Warning,
    [ShotStatus.Approved]: Tone.Neutral
};

const submissionTones: Readonly<Record<SubmissionStatus, Tone>> = {
    [SubmissionStatus.PendingReview]: Tone.Warning,
    [SubmissionStatus.RevisionRequested]: Tone.Negative,
    [SubmissionStatus.Approved]: Tone.Positive
};

export function RoundStatusBadge({ status }: { readonly status: RoundStatus }): ReactNode {
    return <ToneBadge tone={roundTones[status]}>{roundStatusLabels[status]}</ToneBadge>;
}

export function EntryStatusBadge({ status }: { readonly status: EntryStatus }): ReactNode {
    return <ToneBadge tone={entryTones[status]}>{entryStatusLabels[status]}</ToneBadge>;
}

export function ShotStatusBadge({ status }: { readonly status: ShotStatus }): ReactNode {
    return <ToneBadge tone={shotTones[status]}>{shotStatusLabels[status]}</ToneBadge>;
}

export function SubmissionStatusBadge({ status }: { readonly status: SubmissionStatus }): ReactNode {
    return <ToneBadge tone={submissionTones[status]}>{submissionStatusLabels[status]}</ToneBadge>;
}
