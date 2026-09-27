import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { LoadingRows } from "@/Components/Common/States";
import { TelemetryPage } from "@/Features/Studio/TelemetryPage";

export const metadata: Metadata = { title: "Telemetry" };

export default function TelemetryPageRoute(): ReactNode {
    return (
        <Suspense fallback={<LoadingRows rows={6} />}>
            <TelemetryPage />
        </Suspense>
    );
}
