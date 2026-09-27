"use client";

import { dataEnvelope, userSchema, type UserDto } from "@platform/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { queryKeys } from "@/Api/QueryKeys";
import { Alert, AlertDescription, AlertTitle } from "@/Components/Ui/alert";
import { Button } from "@/Components/Ui/button";
import { safePathOr } from "@/Lib/SafePath";

const errorMessages: Readonly<Record<string, string>> = {
    access_denied: "You cancelled the Discord authorization.",
    invalid_state: "The login session didn't match. Start again from this browser.",
    expired_state: "The login took too long and expired.",
    missing_code: "Discord didn't return an authorization code.",
    authentication_failed: "Discord login failed on the server."
};

class LoginError extends Error {}

interface LoginResult {
    readonly user: UserDto;
    readonly returnTo: string;
}

async function completeLogin(fragment: URLSearchParams): Promise<LoginResult> {
    const error = fragment.get("error");
    if (error !== null) {
        throw new LoginError(errorMessages[error] ?? "Discord login failed.");
    }
    const code = fragment.get("code");
    if (code === null || code.length === 0 || code.length > 128) {
        throw new LoginError("No login code was received.");
    }
    const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ code })
    });
    const payload: unknown = await response.json().catch(() => null);
    const parsed = dataEnvelope(userSchema).safeParse(payload);
    if (!response.ok || !parsed.success) {
        throw new LoginError("The login could not be completed. Try signing in again.");
    }
    return { user: parsed.data.data, returnTo: safePathOr(fragment.get("returnTo")) };
}

export default function AuthCallbackPage(): ReactNode {
    const router = useRouter();
    const queryClient = useQueryClient();
    const started = useRef(false);
    const [failure, setFailure] = useState<string | null>(null);

    useEffect(() => {
        if (started.current) {
            return;
        }
        started.current = true;
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        window.history.replaceState(null, "", window.location.pathname);

        completeLogin(fragment)
            .then(({ user, returnTo }) => {
                queryClient.setQueryData(queryKeys.me, user);
                router.replace(returnTo as Route);
            })
            .catch((error: unknown) => {
                setFailure(error instanceof LoginError ? error.message : "Could not reach the server. Check your connection.");
            });
    }, [queryClient, router]);

    if (failure === null) {
        return (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-24 text-sm" role="status">
                <Loader2 className="size-4 animate-spin" />
                Signing you in…
            </div>
        );
    }
    return (
        <div className="mx-auto max-w-md py-16">
            <Alert variant="destructive">
                <AlertTitle>Sign-in failed</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                    <span>{failure}</span>
                    <Button asChild size="sm" variant="outline">
                        <a href="/auth/login">Try again</a>
                    </Button>
                </AlertDescription>
            </Alert>
        </div>
    );
}
