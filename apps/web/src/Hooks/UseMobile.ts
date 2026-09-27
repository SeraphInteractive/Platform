"use client";

import { useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
    const media = window.matchMedia(mobileQuery);
    media.addEventListener("change", onChange);
    return () => {
        media.removeEventListener("change", onChange);
    };
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(mobileQuery).matches,
        () => false
    );
}
