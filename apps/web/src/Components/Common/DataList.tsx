import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/Lib/Utils";

export function Toolbar({ children, trailing }: { readonly children: ReactNode; readonly trailing?: ReactNode }): ReactNode {
    return (
        <div className="bg-card mb-4 flex min-h-12 flex-wrap items-center gap-2 rounded-md border px-2 py-[7px]">
            {children}
            {trailing !== undefined && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
        </div>
    );
}

export function DataList({ children }: { readonly children: ReactNode }): ReactNode {
    return <ul className="bg-card divide-y overflow-hidden rounded-md border">{children}</ul>;
}

interface DataRowProps {
    readonly href: Route;
    readonly code?: ReactNode;
    readonly title: ReactNode;
    readonly meta?: ReactNode;
    readonly fields?: ReactNode;
    readonly highlight?: boolean;
}

export function DataRow({ href, code, title, meta, fields, highlight = false }: DataRowProps): ReactNode {
    return (
        <li>
            <Link
                href={href}
                className={cn(
                    "hover:bg-accent/60 focus-visible:bg-accent/60 flex items-center gap-3 px-3 py-2 focus-visible:outline-none",
                    highlight && "bg-primary/5"
                )}
            >
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
