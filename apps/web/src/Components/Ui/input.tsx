import * as React from "react";
import { cn } from "@/Lib/Utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                "h-9 w-full min-w-0 rounded-md border border-input/80 bg-input/10 px-3 py-1 text-base shadow-[inset_0_1px_2px_0_rgba(0,0,0,0.25)] transition-[color,box-shadow,border-color] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-white/[0.09] dark:bg-black/20",
                "focus-visible:border-white/25 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]",
                "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                "user-invalid:border-destructive user-invalid:ring-destructive/20 dark:user-invalid:ring-destructive/40",
                className
            )}
            {...props}
        />
    );
}

export { Input };
