"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StairwayLoader } from "@/components/StairwayLoader";

export default function AuthCallbackPage() {
    const router = useRouter();
    const started = useRef(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        async function handleExchange() {
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");
            const err = params.get("error");
            const returnTo = params.get("returnTo") || "/";

            if (err) {
                setError("Discord authorization was cancelled or failed.");
                return;
            }

            if (!code) {
                setError("No authorization code received from Discord.");
                return;
            }

            try {
                const res = await fetch("/api/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code })
                });

                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    setError(body?.error || "Discord login failed on the server.");
                    return;
                }

                window.location.href = returnTo;
            } catch {
                setError("Network error communicating with authentication service.");
            }
        }

        handleExchange();
    }, [router]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#1a1c1f] p-6 text-center select-none">
                <StairwayLoader size="md" label="Authentication Error" />
                <p className="mt-4 text-xs text-red-400 font-mono max-w-sm">{error}</p>
                <button
                    onClick={() => router.push("/auth/login")}
                    className="mt-4 px-4 py-1.5 bg-[#4c8aec] hover:bg-[#3b7be0] text-white rounded text-xs font-medium transition-colors"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-[#1a1c1f] select-none">
            <StairwayLoader size="md" label="Authenticating Administrator..." />
        </div>
    );
}
