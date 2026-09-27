import type { ShotDto } from "@platform/contracts";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { RelativeTime } from "@/Components/Common/RelativeTime";
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
        <span className="text-warning inline-flex items-center gap-1 text-xs">
            <Lock className="size-3" aria-hidden="true" />
            <span>
                Senior priority, opens <RelativeTime value={shot.seniorPriorityUntil} />
            </span>
        </span>
    );
}

export function ClaimantText({ shot }: { readonly shot: ShotDto }): ReactNode {
    if (shot.claimer === null) {
        return <span className="text-muted-foreground">—</span>;
    }
    return (
        <span>
            {shot.claimer.username}
            {shot.deadlineAt !== null && (
                <span className="text-muted-foreground">
                    {" · "}
                    <RelativeTime value={shot.deadlineAt} prefix="due" />
                </span>
            )}
        </span>
    );
}
