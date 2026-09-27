"use client";

import type { Role } from "@platform/contracts";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { describeError } from "@/Api/ApiClient";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Button } from "@/Components/Ui/button";
import { Skeleton } from "@/Components/Ui/skeleton";
import { loginHref, useSession } from "@/Hooks/UseSession";
import { cn } from "@/Lib/Utils";
import { hasAtLeast, roleLabels } from "@/Lib/Roles";

const titleWidths = ["w-2/5", "w-3/5", "w-1/3", "w-1/2", "w-2/3", "w-1/4"];
const metaWidths = ["w-1/5", "w-1/4", "w-1/6", "w-1/5", "w-1/3", "w-1/4"];

export function LoadingRows({ rows = 5 }: { readonly rows?: number }): ReactNode {
    return (
        <div className="bg-card divide-y overflow-hidden rounded-md border" aria-busy="true" aria-label="Loading">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex h-[49px] items-center gap-3 px-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className={cn("h-3", titleWidths[index % titleWidths.length])} />
                        <Skeleton className={cn("h-2.5", metaWidths[index % metaWidths.length])} />
                    </div>
                    <Skeleton className="hidden h-5 w-16 sm:block" />
                </div>
            ))}
        </div>
    );
}

export function PageSkeleton(): ReactNode {
    return (
        <div aria-busy="true" aria-label="Loading">
            <div className="mb-4 flex h-8 items-center">
                <Skeleton className="h-5 w-40" />
            </div>
            <div className="bg-card mb-4 flex h-12 items-center gap-2 rounded-md border px-2">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-36" />
            </div>
            <LoadingRows rows={8} />
        </div>
    );
}

export function ErrorState({ error, onRetry }: { readonly error: unknown; readonly onRetry?: () => void }): ReactNode {
    return (
        <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not load this</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-2">
                <span>{describeError(error)}</span>
                {onRetry !== undefined && (
                    <Button size="sm" variant="outline" onClick={onRetry}>
                        Try again
                    </Button>
                )}
            </AlertDescription>
        </Alert>
    );
}

export function EmptyState({ title, children }: { readonly title: string; readonly children?: ReactNode }): ReactNode {
    return (
        <div className="text-muted-foreground flex flex-col items-center gap-2 border border-dashed px-6 py-12 text-center text-sm">
            <Inbox className="size-5" />
            <p className="text-foreground font-medium">{title}</p>
            {children}
        </div>
    );
}

export function SignInPrompt({ message }: { readonly message: string }): ReactNode {
    const pathname = usePathname();
    return (
        <div className="flex flex-col items-center gap-3 border border-dashed px-6 py-12 text-center text-sm">
            <Lock className="text-muted-foreground size-5" />
            <p>{message}</p>
            <Button asChild size="sm">
                <a href={loginHref(pathname)}>Sign in with Discord</a>
            </Button>
        </div>
    );
}

interface RequireRoleProps {
    readonly role: Role;
    readonly children: ReactNode;
}

export function RequireRole({ role, children }: RequireRoleProps): ReactNode {
    const { user, isLoading } = useSession();
    if (isLoading) {
        return <LoadingRows />;
    }
    if (user === null) {
        return <SignInPrompt message="Sign in to continue." />;
    }
    if (!hasAtLeast(user, role)) {
        return <EmptyState title="Not available">This area needs the {roleLabels[role]} role or higher.</EmptyState>;
    }
    return children;
}
