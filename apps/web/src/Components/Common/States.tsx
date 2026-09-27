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
import { hasAtLeast, roleLabels } from "@/Lib/Roles";

export function LoadingRows({ rows = 3 }: { readonly rows?: number }): ReactNode {
    return (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
            ))}
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
