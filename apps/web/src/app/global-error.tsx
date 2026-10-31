"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { StairwayLoader } from "@/Components/Common/StairwayLoader";
import { Button } from "@/Components/Ui/button";

interface GlobalErrorProps {
    readonly error: Error & { readonly digest?: string };
    readonly reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps): ReactNode {
    return (
        <html lang="en" className="dark">
            <body className="min-h-dvh bg-[#121214] text-neutral-100 antialiased flex flex-col items-center justify-center p-6 text-center">
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                    <StairwayLoader size="md" />
                    <p className="text-neutral-500 font-mono text-xs tracking-wider uppercase">500</p>
                    <h1 className="text-xl font-semibold">An unexpected error occurred</h1>
                    <p className="text-neutral-400 max-w-sm text-sm">
                        Something went wrong while loading the platform.
                        {error.digest !== undefined && (
                            <span className="block mt-1 text-xs font-mono text-neutral-500">Reference: {error.digest}</span>
                        )}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                        <Button size="sm" variant="outline" onClick={reset}>
                            Try again
                        </Button>
                        <Button asChild size="sm" variant="outline">
                            <Link href="/">Overview</Link>
                        </Button>
                    </div>
                </div>
            </body>
        </html>
    );
}
