import Link from "next/link";
import type { ReactNode } from "react";
import { StairwayLoader } from "@/components/StairwayLoader";

export default function NotFound(): ReactNode {
    return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#121214] text-neutral-100 p-6 text-center select-none">
            <div className="flex flex-col items-center gap-4 py-20 text-center">
                <StairwayLoader size="md" />
                <p className="text-zinc-500 font-mono text-xs tracking-wider uppercase">404</p>
                <h1 className="text-xl font-semibold">Screenplay not found</h1>
                <p className="text-zinc-400 max-w-sm text-sm">
                    The requested draft or script does not exist, or you may not have authorization to view it.
                </p>
                <Link
                    href="/"
                    className="mt-2 inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                >
                    Return to Desk
                </Link>
            </div>
        </div>
    );
}
