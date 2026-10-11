"use client";

import { Clock, Lock } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { formatDateTime } from "@/Lib/Format";
import { cn } from "@/Lib/Utils";

export interface CountdownTimerProps {
    readonly targetDate: string | Date | null | undefined;
    readonly prefix?: string;
    readonly expiredLabel?: string;
    readonly icon?: "clock" | "lock" | "none";
    readonly className?: string;
}

function formatRemaining(diffMs: number, prefix?: string): string {
    const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let timeStr = "";
    if (days >= 1) {
        timeStr = `${days}d ${hours}h left`;
    } else if (hours >= 1) {
        timeStr = `${hours}h ${minutes}m left`;
    } else {
        timeStr = `${minutes}m ${seconds}s left`;
    }

    return prefix ? `${prefix} ${timeStr}` : timeStr;
}

export function CountdownTimer({ targetDate, prefix, expiredLabel = "Ended", icon = "clock", className }: CountdownTimerProps): ReactNode {
    const [now, setNow] = useState(() => Date.now());

    const targetTime = targetDate ? (typeof targetDate === "string" ? new Date(targetDate).getTime() : targetDate.getTime()) : 0;
    const diff = targetTime - now;

    // accelerate tick rate when time is running short
    const tickInterval = diff <= 3_600_000 ? 1000 : diff <= 86_400_000 ? 10_000 : 60_000;

    useEffect(() => {
        if (!targetDate) {
            return;
        }
        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, tickInterval);
        return () => window.clearInterval(timer);
    }, [targetDate, tickInterval]);

    if (!targetDate) {
        return null;
    }

    const isExpired = diff <= 0;
    const IconComponent = icon === "lock" ? Lock : icon === "clock" ? Clock : null;

    return (
        <span
            title={typeof targetDate === "string" ? formatDateTime(targetDate) : undefined}
            className={cn("inline-flex items-center gap-1 font-mono text-[11px] leading-none text-muted-foreground", className)}
        >
            {IconComponent && <IconComponent className="size-3 shrink-0" />}
            <span>{isExpired ? expiredLabel : formatRemaining(diff, prefix)}</span>
        </span>
    );
}
