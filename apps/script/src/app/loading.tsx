import type { ReactNode } from "react";
import { StairwayLoader } from "@/components/StairwayLoader";

export default function Loading(): ReactNode {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-[#121214] py-20 select-none">
            <StairwayLoader size="md" />
        </div>
    );
}
