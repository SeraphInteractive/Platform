import type { ShotDto } from "@platform/contracts";
import type { ReactNode } from "react";
import { CountdownTimer } from "@/Components/Common/CountdownTimer";
import { difficultyLabels, pluralize } from "@/Lib/Format";

export function DifficultyText({ shot }: { readonly shot: ShotDto }): ReactNode {
    return (
        <span>
            {difficultyLabels[shot.difficultyTier]} · {shot.tierDays} {pluralize(shot.tierDays, "day")}
        </span>
    );
}

export function SeniorLock({ shot }: { readonly shot: ShotDto }): ReactNode {
    if (!shot.isSeniorLocked || shot.seniorPriorityUntil === null) {
        return null;
    }
    return (
        <span className="text-warning inline-flex items-center gap-1.5 text-xs">
            <CountdownTimer targetDate={shot.seniorPriorityUntil} prefix="Senior lock:" icon="lock" />
        </span>
    );
}

export function ClaimantText({ shot }: { readonly shot: ShotDto }): ReactNode {
    if (shot.claimer === null) {
        return <span className="text-muted-foreground">—</span>;
    }
    return (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
            <span>{shot.claimer.username}</span>
            {shot.deadlineAt !== null && (
                <CountdownTimer targetDate={shot.deadlineAt} prefix="Due in" />
            )}
        </span>
    );
}
