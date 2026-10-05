import type { ReactNode } from "react";

interface SectionProps {
    readonly title: string;
    readonly description?: ReactNode;
    readonly actions?: ReactNode;
    readonly children: ReactNode;
}

export function Section({ title, description, actions, children }: SectionProps): ReactNode {
    return (
        <section className="space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="space-y-1">
                    <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h2>
                    {description !== undefined && <p className="text-muted-foreground text-xs text-pretty">{description}</p>}
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}
