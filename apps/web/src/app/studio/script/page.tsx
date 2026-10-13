"use client";

import { useEffect } from "react";
import { StairwayLoader } from "@/Components/Common/States";

export default function StudioScriptRedirect(): React.ReactElement {
    useEffect(() => {
        const targetUrl = process.env.NEXT_PUBLIC_SCRIPT_URL || "http://localhost:3002";
        window.location.href = targetUrl;
    }, []);

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center select-none">
            <StairwayLoader />
            <p className="mt-4 font-mono text-xs text-muted-foreground">Opening Studio...</p>
        </div>
    );
}
