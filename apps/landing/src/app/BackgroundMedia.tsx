"use client";

import { Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

// the poster is the video's first frame, so the hand-off from image to video is invisible
const POSTER_SRC = "/hero.jpg";
const PAUSED_KEY = "stairway:bg-paused";

interface NetworkInformationLike {
    readonly saveData?: boolean;
}

// the video is decoration: skip it entirely for reduced motion or data saver, and let anyone pause it
function shouldLoadVideo(): boolean {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return false;
    }
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    return connection?.saveData !== true;
}

function readPausedPreference(): boolean {
    try {
        return window.localStorage.getItem(PAUSED_KEY) === "1";
    } catch {
        return false;
    }
}

function writePausedPreference(paused: boolean): void {
    try {
        window.localStorage.setItem(PAUSED_KEY, paused ? "1" : "0");
    } catch {
        // storage can be unavailable (private mode, blocked site data); the toggle still works for this visit
    }
}

export function BackgroundMedia(): ReactNode {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (shouldLoadVideo()) {
            setPaused(readPausedPreference());
            setEnabled(true);
        }
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (video === null) {
            return;
        }
        if (paused) {
            video.pause();
        } else {
            // autoplay can still be refused by the browser; the poster stays visible in that case
            video.play().catch(() => undefined);
        }
    }, [paused, enabled]);

    const toggle = (): void => {
        setPaused((current) => {
            writePausedPreference(!current);
            return !current;
        });
    };

    return (
        <>
            <div aria-hidden="true" className="fixed inset-0 -z-20">
                <Image src={POSTER_SRC} alt="" fill priority sizes="100vw" className="object-cover" />
                {enabled && (
                    <video
                        ref={videoRef}
                        className="absolute inset-0 size-full object-cover"
                        poster={POSTER_SRC}
                        muted
                        loop
                        playsInline
                        autoPlay={!paused}
                        preload="auto"
                    >
                        <source src="/media/sakura-720.mp4" type="video/mp4" media="(max-width: 767px)" />
                        <source src="/media/sakura-1080.mp4" type="video/mp4" />
                    </video>
                )}
                {/* static depth-of-field: the lower part of the frame softens slightly */}
                <div className="progressive-blur inset-x-0 bottom-0 h-1/2 [--pb-max:8px]">
                    <div />
                    <div />
                    <div />
                    <div />
                    <div />
                </div>
            </div>

            {enabled && (
                <button
                    type="button"
                    onClick={toggle}
                    aria-pressed={paused}
                    className="focus-ring fixed right-4 bottom-4 z-40 flex size-10 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white backdrop-blur-md transition-colors hover:bg-black/60 md:right-6 md:bottom-6"
                >
                    {paused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
                    <span className="sr-only">Pause background video</span>
                </button>
            )}
        </>
    );
}
