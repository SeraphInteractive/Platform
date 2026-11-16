"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { StairwayLoader } from "@/components/StairwayLoader";

interface ErrorProps {
    readonly error: Error & { readonly digest?: string };
    readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps): ReactNode {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#121214] text-neutral-100 p-6 text-center select-none">
            <div className="flex flex-col items-center gap-4 py-20 text-center">
                <StairwayLoader size="md" />
                <p className="text-zinc-500 font-mono text-xs tracking-wider uppercase">500</p>
                <h1 className="text-xl font-semibold">An unexpected screenplay error occurred</h1>
                <p className="text-zinc-400 max-w-sm text-sm">
                    Something went wrong loading this screenplay session.
                    {error.digest !== undefined && (
                        <span className="block mt-1 text-xs font-mono text-zinc-500">Reference: {error.digest}</span>
                    )}
                </p>
                <div className="flex items-center gap-3 mt-2">
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                    >
                        Return to Desk
                    </Link>
                </div>
            </div>
        </div>
    );
}
