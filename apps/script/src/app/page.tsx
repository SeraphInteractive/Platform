"use client";

import React from "react";
import { AccessGuard } from "@/components/AccessGuard";
import { ScriptDashboard } from "@/components/ScriptDashboard";

export default function HomePage() {
    return (
        <AccessGuard>
            <ScriptDashboard />
        </AccessGuard>
    );
}
