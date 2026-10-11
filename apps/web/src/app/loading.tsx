import type { ReactNode } from "react";
import { StairwayLoader } from "@/Components/Common/StairwayLoader";

export default function Loading(): ReactNode {
    return (
        <div className="flex min-h-[50vh] items-center justify-center py-20">
            <StairwayLoader size="md" />
        </div>
    );
}
