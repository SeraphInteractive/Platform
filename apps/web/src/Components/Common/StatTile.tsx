import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/Lib/Utils";

interface StatTileProps {
    readonly label: string;
    readonly value: ReactNode;
    readonly hint?: ReactNode;
    readonly href?: Route;
    readonly emphasis?: boolean;
}

export function StatTile({ label, value, hint, href, emphasis = false }: StatTileProps): ReactNode {
    const body = (
        <div
            className={cn(
                "bg-card flex h-full flex-col gap-0.5 rounded-md border px-4 py-3 transition-colors",
                href !== undefined && "hover:bg-accent/50",
                emphasis && "border-primary/50"
            )}
        >
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="text-xl font-semibold tabular-nums">{value}</span>
            {hint !== undefined && <span className="text-muted-foreground text-xs">{hint}</span>}
        </div>
    );
    return href === undefined ? (
        body
    ) : (
        <Link href={href} className="focus-visible:ring-ring block focus-visible:ring-2 focus-visible:outline-none">
            {body}
        </Link>
    );
}
