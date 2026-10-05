import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/Components/Ui/button";

export default function NotFound(): ReactNode {
    return (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-muted-foreground text-xs tracking-wider uppercase">404</p>
            <h1 className="text-xl font-semibold">This page wandered off</h1>
            <p className="text-muted-foreground max-w-sm text-sm">
                The link may be old, or the round or task was removed. Search with Ctrl K, or head back to the overview.
            </p>
            <Button asChild variant="outline" size="sm">
                <Link href="/">Back to the overview</Link>
            </Button>
        </div>
    );
}
