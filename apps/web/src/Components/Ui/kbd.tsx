import { cn } from "@/Lib/Utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            data-slot="kbd"
            className={cn(
                "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded border border-border/80 bg-muted/80 px-1 font-sans text-xs font-medium text-muted-foreground select-none shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_1px_1px_0_rgba(0,0,0,0.25)] dark:border-white/[0.12] dark:bg-card",
                "[&_svg:not([class*='size-'])]:size-3",
                "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
                className
            )}
            {...props}
        />
    );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
    return <kbd data-slot="kbd-group" className={cn("inline-flex items-center gap-1", className)} {...props} />;
}

export { Kbd, KbdGroup };
