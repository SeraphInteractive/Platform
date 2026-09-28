"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/Lib/Utils";

interface TaskImageCarouselProps {
    readonly images: readonly string[];
    readonly alt?: string;
    readonly className?: string;
}

const autoCycleIntervalMs = 4_000;

export function TaskImageCarousel({ images, alt = "Task reference image", className }: TaskImageCarouselProps): ReactNode {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const count = images.length;

    useEffect(() => {
        if (count <= 1 || isPaused) {
            return;
        }

        const timer = setInterval(() => {
            setActiveIndex((current) => (current + 1) % count);
        }, autoCycleIntervalMs);

        return () => clearInterval(timer);
    }, [count, isPaused]);

    if (count === 0) {
        return null;
    }

    if (count === 1) {
        return (
            <div className={cn("overflow-hidden rounded-lg border bg-muted/20", className)}>
                <div className="relative aspect-video w-full max-h-[420px] bg-black/40">
                    <img
                        src={images[0]}
                        alt={alt}
                        className="size-full object-contain"
                        loading="lazy"
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            className={cn("group relative overflow-hidden rounded-lg border bg-muted/20", className)}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onTouchStart={() => setIsPaused(true)}
            onTouchEnd={() => setIsPaused(false)}
        >
            <div className="relative aspect-video w-full max-h-[420px] bg-black/40">
                {images.map((url, idx) => (
                    <div
                        key={url}
                        className={cn(
                            "absolute inset-0 size-full transition-opacity duration-500 ease-in-out",
                            idx === activeIndex ? "opacity-100 z-10" : "opacity-0 pointer-events-none z-0"
                        )}
                        aria-hidden={idx !== activeIndex}
                    >
                        <img
                            src={url}
                            alt={`${alt} (${idx + 1}/${count})`}
                            className="size-full object-contain"
                            loading={idx === 0 ? "eager" : "lazy"}
                        />
                    </div>
                ))}
            </div>

            {/* dot indicators */}
            <div className="absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5 px-4">
                {images.map((_, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveIndex(idx)}
                        className={cn(
                            "h-1.5 rounded-full transition-all duration-300",
                            idx === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                        )}
                        aria-label={`Go to slide ${idx + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}
