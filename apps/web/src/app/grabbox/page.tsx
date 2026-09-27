import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { LoadingRows } from "@/Components/Common/States";
import { GrabboxView } from "@/Features/Grabbox/GrabboxView";

export const metadata: Metadata = { title: "Grab-box" };

export default function GrabboxPage(): ReactNode {
    return (
        <Suspense fallback={<LoadingRows rows={6} />}>
            <GrabboxView />
        </Suspense>
    );
}
