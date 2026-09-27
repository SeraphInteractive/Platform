import type { ReactNode } from "react";

interface PageHeaderProps {
    readonly title: string;
    readonly eyebrow?: string;
    readonly description?: ReactNode;
    readonly actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps): ReactNode {
    return (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
                {eyebrow !== undefined && <p className="text-muted-foreground text-xs tracking-wider uppercase">{eyebrow}</p>}
                <h1 className="truncate text-lg font-semibold">{title}</h1>
                {description !== undefined && <div className="text-muted-foreground text-[13px]">{description}</div>}
            </div>
            {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
