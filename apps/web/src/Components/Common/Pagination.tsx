import type { PaginationMeta } from "@platform/contracts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/Components/Ui/button";

interface PaginationProps {
    readonly meta: PaginationMeta;
    readonly onPageChange: (page: number) => void;
}

export function Pagination({ meta, onPageChange }: PaginationProps): ReactNode {
    if (meta.totalPages <= 1) {
        return null;
    }
    return (
        <nav aria-label="Pagination" className="text-muted-foreground mt-4 flex items-center justify-between text-xs">
            <span>
                Page {meta.page} of {meta.totalPages} · {meta.total} total
            </span>
            <div className="flex gap-1">
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={meta.page <= 1}
                    onClick={() => {
                        onPageChange(meta.page - 1);
                    }}
                >
                    <ChevronLeft />
                </Button>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={meta.page >= meta.totalPages}
                    onClick={() => {
                        onPageChange(meta.page + 1);
                    }}
                >
                    <ChevronRight />
                </Button>
            </div>
        </nav>
    );
}
