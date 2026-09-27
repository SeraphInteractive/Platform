"use client";

import type { ReactNode } from "react";
import { Button } from "@/Components/Ui/button";

interface ErrorPageProps {
    readonly error: Error & { readonly digest?: string };
    readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps): ReactNode {
    return (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-muted-foreground text-xs tracking-wider uppercase">Something broke</p>
            <h1 className="text-xl font-semibold">This page hit an unexpected error</h1>
            <p className="text-muted-foreground max-w-sm text-sm">
                Try again. If it keeps happening, tell the team on Discord
                {error.digest === undefined ? "." : ` and mention reference ${error.digest}.`}
            </p>
            <Button size="sm" variant="outline" onClick={reset}>
                Try again
            </Button>
        </div>
    );
}
