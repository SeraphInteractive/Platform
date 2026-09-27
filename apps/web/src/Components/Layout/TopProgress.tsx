"use client";

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/Lib/Utils";

const showDelayMs = 120;
const settleMs = 250;

function isInternalNavigation(event: MouseEvent): boolean {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return false;
    }
    const anchor = (event.target as Element | null)?.closest("a");
    if (anchor === null || anchor === undefined || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return false;
    }
    const url = new URL(anchor.href, window.location.href);
    return (
        url.origin === window.location.origin &&
        !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/auth/") &&
        url.pathname + url.search !== window.location.pathname + window.location.search
    );
}

export function TopProgress(): ReactNode {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const fetching = useIsFetching({ predicate: (query) => query.state.data === undefined });
    const mutating = useIsMutating();
    const [navigating, setNavigating] = useState(false);
    const [visible, setVisible] = useState(false);
    const [width, setWidth] = useState(0);
    const location = `${pathname}?${searchParams.toString()}`;
    const lastLocation = useRef(location);
    const busy = navigating || fetching > 0 || mutating > 0;

    useEffect(() => {
        const onClick = (event: MouseEvent): void => {
            if (isInternalNavigation(event)) {
                setNavigating(true);
            }
        };
        document.addEventListener("click", onClick, true);
        return () => {
            document.removeEventListener("click", onClick, true);
        };
    }, []);

    useEffect(() => {
        if (lastLocation.current === location) {
            return;
        }
        lastLocation.current = location;
        const timer = window.setTimeout(() => {
            setNavigating(false);
        }, 0);
        return () => {
            window.clearTimeout(timer);
        };
    }, [location]);

    useEffect(() => {
        if (busy) {
            const show = window.setTimeout(() => {
                setVisible(true);
                setWidth((current) => (current < 10 ? 10 : current));
            }, showDelayMs);
            const grow = window.setInterval(() => {
                setWidth((current) => current + (90 - current) * 0.08);
            }, 200);
            return () => {
                window.clearTimeout(show);
                window.clearInterval(grow);
            };
        }
        const finish = window.setTimeout(() => {
            setWidth((current) => (current > 0 ? 100 : 0));
        }, 0);
        const hide = window.setTimeout(() => {
            setVisible(false);
            setWidth(0);
        }, settleMs);
        return () => {
            window.clearTimeout(finish);
            window.clearTimeout(hide);
        };
    }, [busy]);

    return (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5" aria-hidden="true">
            <div
                className={cn("bg-primary h-full transition-[width,opacity] duration-200 ease-out", visible ? "opacity-100" : "opacity-0")}
                style={{ width: `${width}%` }}
            />
        </div>
    );
}
