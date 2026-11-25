"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SECTIONS } from "./content";

const LAST_INDEX = SECTIONS.length - 1;
const WHEEL_THRESHOLD = 55;
const GESTURE_GAP_MS = 140;
const TRANSITION_LOCK_MS = 780;
const TOUCH_THRESHOLD = 48;

interface StageContextValue {
    readonly activeIndex: number;
    readonly activeId: string;
    readonly direction: 1 | -1;
    readonly isTransitioning: boolean;
    readonly goTo: (target: number | string) => void;
    readonly step: (delta: 1 | -1) => void;
}

const StageContext = createContext<StageContextValue | null>(null);

function resolveIndex(target: number | string): number {
    if (typeof target === "number") {
        return Math.max(0, Math.min(LAST_INDEX, target));
    }
    const clean = target.replace(/^#/, "");
    const found = SECTIONS.findIndex((section) => section.id === clean);
    return found === -1 ? 0 : found;
}

function findScrollablePanel(start: EventTarget | null): HTMLElement | null {
    let node = start instanceof HTMLElement ? start : null;
    while (node) {
        if (node.dataset.sectionScroll === "true" && node.scrollHeight > node.clientHeight + 2) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function canPanelScroll(panel: HTMLElement, deltaY: number): boolean {
    if (deltaY > 0) {
        return panel.scrollTop + panel.clientHeight < panel.scrollHeight - 2;
    }
    if (deltaY < 0) {
        return panel.scrollTop > 2;
    }
    return false;
}

export function StageProvider({ children }: { readonly children: ReactNode }): ReactNode {
    const [activeIndex, setActiveIndex] = useState(0);
    const [direction, setDirection] = useState<1 | -1>(1);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const indexRef = useRef(0);
    const lockUntilRef = useRef(0);
    const transitionTimerRef = useRef<number>(0);

    const commitIndex = useCallback((nextIndex: number, syncHash: boolean) => {
        const current = indexRef.current;
        if (nextIndex === current) return;

        indexRef.current = nextIndex;
        setDirection(nextIndex > current ? 1 : -1);
        setActiveIndex(nextIndex);
        setIsTransitioning(true);
        lockUntilRef.current = performance.now() + TRANSITION_LOCK_MS;

        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = window.setTimeout(() => {
            setIsTransitioning(false);
        }, TRANSITION_LOCK_MS);

        if (syncHash) {
            const section = SECTIONS[nextIndex];
            if (section) {
                const nextUrl = nextIndex === 0 ? window.location.pathname : `#${section.id}`;
                window.history.replaceState(null, "", nextUrl);
            }
        }
    }, []);

    const goTo = useCallback(
        (target: number | string) => {
            commitIndex(resolveIndex(target), true);
        },
        [commitIndex]
    );

    const step = useCallback(
        (delta: 1 | -1) => {
            const next = Math.max(0, Math.min(LAST_INDEX, indexRef.current + delta));
            commitIndex(next, true);
        },
        [commitIndex]
    );

    useEffect(() => {
        if (window.location.hash) {
            const hashed = resolveIndex(window.location.hash);
            if (hashed !== 0) {
                commitIndex(hashed, false);
            }
        }

        const onHashChange = () => {
            const next = window.location.hash ? resolveIndex(window.location.hash) : 0;
            commitIndex(next, false);
        };

        window.addEventListener("hashchange", onHashChange);
        return () => {
            window.removeEventListener("hashchange", onHashChange);
            window.clearTimeout(transitionTimerRef.current);
        };
    }, [commitIndex]);

    useEffect(() => {
        let wheelSum = 0;
        let lastEventTime = 0;
        let lastAbsDy = 0;
        let awaitingRest = false;
        let touchStartY = 0;
        let touchPanel: HTMLElement | null = null;

        const onWheel = (event: WheelEvent) => {
            const scale = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? window.innerHeight : 1;
            const dy = event.deltaY * scale;
            if (Math.abs(dy) < 0.5) return;

            const panel = findScrollablePanel(event.target);
            if (panel && canPanelScroll(panel, dy)) {
                wheelSum = 0;
                return;
            }

            event.preventDefault();

            const now = performance.now();
            const gap = now - lastEventTime;
            const absDy = Math.abs(dy);

            // reset after pause or sharp re-flick so trackpad inertia tails don't double-skip
            if (gap > GESTURE_GAP_MS) {
                wheelSum = 0;
                awaitingRest = false;
            } else if (awaitingRest && absDy > lastAbsDy * 1.45 && absDy > 30) {
                awaitingRest = false;
                wheelSum = 0;
            }

            lastEventTime = now;
            lastAbsDy = absDy;

            if (now < lockUntilRef.current || awaitingRest) return;

            if (wheelSum * dy < 0) {
                wheelSum = 0;
            }
            wheelSum += dy;

            if (Math.abs(wheelSum) >= WHEEL_THRESHOLD) {
                const move: 1 | -1 = wheelSum > 0 ? 1 : -1;
                wheelSum = 0;
                awaitingRest = true;
                step(move);
            }
        };

        const onTouchStart = (event: TouchEvent) => {
            touchStartY = event.touches[0]?.clientY ?? 0;
            touchPanel = findScrollablePanel(event.target);
        };

        const onTouchEnd = (event: TouchEvent) => {
            const endY = event.changedTouches[0]?.clientY ?? touchStartY;
            const deltaY = touchStartY - endY;
            if (Math.abs(deltaY) < TOUCH_THRESHOLD) return;

            if (touchPanel && canPanelScroll(touchPanel, deltaY)) {
                return;
            }
            if (performance.now() < lockUntilRef.current) return;

            step(deltaY > 0 ? 1 : -1);
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
                return;
            }

            if (event.key === "ArrowDown" || event.key === "PageDown") {
                event.preventDefault();
                step(1);
            } else if (event.key === "ArrowUp" || event.key === "PageUp") {
                event.preventDefault();
                step(-1);
            } else if (event.key === "Home") {
                event.preventDefault();
                goTo(0);
            } else if (event.key === "End") {
                event.preventDefault();
                goTo(LAST_INDEX);
            }
        };

        window.addEventListener("wheel", onWheel, { passive: false });
        window.addEventListener("touchstart", onTouchStart, { passive: true });
        window.addEventListener("touchend", onTouchEnd, { passive: true });
        window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("wheel", onWheel);
            window.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchend", onTouchEnd);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [goTo, step]);

    const activeId = SECTIONS[activeIndex]?.id ?? "home";

    return (
        <StageContext.Provider value={{ activeIndex, activeId, direction, isTransitioning, goTo, step }}>{children}</StageContext.Provider>
    );
}

export function useStage(): StageContextValue {
    const value = useContext(StageContext);
    if (!value) {
        throw new Error("useStage must be used inside StageProvider");
    }
    return value;
}
