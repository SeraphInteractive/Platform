"use client";

import type { ReactNode } from "react";
import { StairwayLoader } from "@/Components/Common/StairwayLoader";
import { Button } from "@/Components/Ui/button";

interface ErrorPageProps {
    readonly error: Error & { readonly digest?: string };
    readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps): ReactNode {
    return (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
            <StairwayLoader size="md" />
            <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">500</p>
            <h1 className="text-xl font-semibold">This page hit an unexpected error</h1>
            <p className="text-muted-foreground max-w-sm text-sm">
                Try again. If it keeps happening, tell the team on Discord
                {error.digest === undefined ? "." : ` and mention reference ${error.digest}.`}
            </p>
            <div className="flex items-center gap-3">
                <Button size="sm" variant="outline" onClick={reset}>
                    Try again
                </Button>
            </div>
        </div>
    );
}
