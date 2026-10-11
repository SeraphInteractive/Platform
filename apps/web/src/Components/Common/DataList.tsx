import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/Lib/Utils";

export function Toolbar({
    children,
    trailing,
    className
}: {
    readonly children: ReactNode;
    readonly trailing?: ReactNode;
    readonly className?: string;
}): ReactNode {
    return (
        <div
            className={cn(
                "bg-card mb-4 flex min-h-12 max-w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 p-1.5 sm:px-2 sm:py-[7px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.25)] dark:bg-card/80 backdrop-blur-xs",
                className
            )}
        >
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 overflow-x-auto py-0.5 no-scrollbar">{children}</div>
            {trailing !== undefined && <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">{trailing}</div>}
        </div>
    );
}

export function DataList({ children }: { readonly children: ReactNode }): ReactNode {
    return (
        <ul className="bg-card divide-y overflow-hidden rounded-lg border border-border/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.25)] dark:bg-card/80">
            {children}
        </ul>
    );
}

interface DataRowProps {
    readonly href: Route;
    readonly code?: ReactNode;
    readonly thumbnail?: ReactNode;
    readonly title: ReactNode;
    readonly meta?: ReactNode;
    readonly fields?: ReactNode;
    readonly highlight?: boolean;
}

export function DataRow({ href, code, thumbnail, title, meta, fields, highlight = false }: DataRowProps): ReactNode {
    return (
        <li>
            <Link
                href={href}
                className={cn(
                    "hover:bg-accent/60 focus-visible:bg-accent/60 flex items-center gap-3 px-3 py-2 focus-visible:outline-none",
                    highlight && "bg-primary/5"
                )}
            >
                {thumbnail !== undefined && <div className="size-8 shrink-0 overflow-hidden rounded border bg-muted/40">{thumbnail}</div>}
                {code !== undefined && <span className="text-muted-foreground w-24 shrink-0 truncate font-mono text-xs">{code}</span>}
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    {meta !== undefined && <span className="text-muted-foreground block truncate text-xs">{meta}</span>}
                </span>
                {fields !== undefined && <span className="hidden shrink-0 items-center gap-2 sm:flex">{fields}</span>}
            </Link>
        </li>
    );
}
