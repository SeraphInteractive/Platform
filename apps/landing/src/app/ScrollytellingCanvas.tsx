"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollytellingCanvasProps {
    readonly currentFrame: number;
    readonly totalFrames: number;
    readonly dampeningOpacity?: number;
}

const getFramePath = (frame: number): string => `/valley-frames/frame_${String(Math.min(720, Math.max(1, frame))).padStart(4, "0")}.jpg`;

const PRELOAD_WINDOW = 20;

export function ScrollytellingCanvas({ currentFrame, totalFrames, dampeningOpacity = 1 }: ScrollytellingCanvasProps): ReactNode {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cacheRef = useRef<Map<number, HTMLImageElement>>(new Map());
    const lastDrawnFrameRef = useRef<number | null>(null);
    const isMountedRef = useRef(true);
    const [hasLoadedFirst, setHasLoadedFirst] = useState(false);

    // handles responsive canvas buffer sizing with dpr cap to preserve 60fps
    const resizeCanvas = (): void => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
        }
    };

    const drawFrame = (frameNum: number): boolean => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return false;
        }
        resizeCanvas();
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
            return false;
        }

        const cache = cacheRef.current;
        let img = cache.get(frameNum);

        // fallback to nearest complete frame in cache to eliminate black flickers
        if (!img || !img.complete || img.naturalWidth === 0) {
            let smallestDiff = Infinity;
            for (const [candidateFrame, candidateImg] of cache.entries()) {
                if (candidateImg.complete && candidateImg.naturalWidth > 0) {
                    const diff = Math.abs(candidateFrame - frameNum);
                    if (diff < smallestDiff) {
                        smallestDiff = diff;
                        img = candidateImg;
                    }
                }
            }
        }

        if (!img || !img.complete || img.naturalWidth === 0) {
            return false;
        }

        const cw = canvas.width;
        const ch = canvas.height;
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;

        // cover scaling centered preserving 16:9 aspect ratio
        const scale = Math.max(cw / iw, ch / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const ox = (cw - dw) / 2;
        const oy = (ch - dh) / 2;

        ctx.drawImage(img, ox, oy, dw, dh);
        lastDrawnFrameRef.current = frameNum;
        return true;
    };

    // mount & initial frame 1 load
    useEffect(() => {
        isMountedRef.current = true;
        const firstImg = new Image();
        firstImg.src = getFramePath(1);
        firstImg.onload = () => {
            if (!isMountedRef.current) {
                return;
            }
            cacheRef.current.set(1, firstImg);
            setHasLoadedFirst(true);
            drawFrame(1);
        };

        const handleResize = (): void => {
            if (lastDrawnFrameRef.current) {
                drawFrame(lastDrawnFrameRef.current);
            }
        };

        window.addEventListener("resize", handleResize, { passive: true });
        return () => {
            isMountedRef.current = false;
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    // windowed preloading around active scroll frame
    useEffect(() => {
        drawFrame(currentFrame);

        const cache = cacheRef.current;
        const start = Math.max(1, currentFrame - 5);
        const end = Math.min(totalFrames, currentFrame + PRELOAD_WINDOW);

        for (let f = start; f <= end; f++) {
            if (!cache.has(f)) {
                const img = new Image();
                img.src = getFramePath(f);
                img.onload = () => {
                    cache.set(f, img);
                    // if this was the frame we were waiting to draw, redraw immediately
                    if (f === currentFrame) {
                        drawFrame(f);
                    }
                };
            }
        }

        // prune frames farther than 80 frames away to keep memory bounded
        if (cache.size > 120) {
            for (const key of cache.keys()) {
                if (Math.abs(key - currentFrame) > 80) {
                    cache.delete(key);
                }
            }
        }
    }, [currentFrame, totalFrames]);

    return (
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none select-none">
            <canvas
                ref={canvasRef}
                className={`h-full w-full object-cover transition-opacity duration-500 ${hasLoadedFirst ? "opacity-100" : "opacity-0"}`}
            />
            {/* cinematic dark overlay: active only when hero title is on screen */}
            <div
                className="absolute inset-0 bg-gradient-to-b from-zinc-950/75 via-zinc-950/40 to-zinc-950/90 pointer-events-none transition-opacity duration-150 ease-out"
                style={{ opacity: dampeningOpacity }}
            />
            <div
                className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-zinc-950/35 to-zinc-950/85 pointer-events-none transition-opacity duration-150 ease-out"
                style={{ opacity: dampeningOpacity }}
            />
        </div>
    );
}
