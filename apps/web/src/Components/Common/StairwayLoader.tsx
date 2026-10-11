import type { ReactNode } from "react";
import { cn } from "@/Lib/Utils";

interface StairwayLoaderProps {
    readonly size?: "sm" | "md" | "lg";
    readonly className?: string;
    readonly label?: string;
}

const sizeClasses = {
    sm: "size-24",
    md: "size-36",
    lg: "size-48",
} as const;

export function StairwayLoader({ size = "md", className, label }: StairwayLoaderProps): ReactNode {
    return (
        <div
            className={cn("flex flex-col items-center justify-center gap-3", className)}
            role="status"
            aria-live="polite"
            aria-label={label ?? "Loading"}
        >
            <div className={cn("relative pointer-events-none select-none overflow-hidden", sizeClasses[size])}>
                <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="auto"
                    aria-hidden="true"
                    tabIndex={-1}
                    className="h-full w-full object-contain invert mix-blend-multiply dark:invert-0 dark:mix-blend-screen"
                >
                    <source src="/branding/stairway-loop.webm" type="video/webm" />
                    <source src="/branding/stairway-loop.mp4" type="video/mp4" />
                </video>
            </div>
            {label !== undefined && label !== "" && (
                <p className="text-muted-foreground font-mono text-xs tracking-wider">{label}</p>
            )}
        </div>
    );
}
