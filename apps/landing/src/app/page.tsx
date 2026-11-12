"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ScrollytellingCanvas } from "./ScrollytellingCanvas";
import { Footer } from "./Footer";

const TOTAL_FRAMES = 720;

interface FaqItem {
    readonly id: number;
    readonly side: "right" | "left";
    readonly question: string;
    readonly answer: string;
    readonly startFrame: number;
    readonly peakStart: number;
    readonly peakEnd: number;
    readonly endFrame: number;
}

const FAQ_ITEMS: readonly FaqItem[] = [
    {
        id: 1,
        side: "right",
        question: "What is Project Stairway?",
        answer: "An open, community-built animated motion picture. Anyone can pick up scenes, submit animation passes, and help build a feature film in the open.",
        startFrame: 110,
        peakStart: 135,
        peakEnd: 180,
        endFrame: 205
    },
    {
        id: 2,
        side: "left",
        question: "How do I vote?",
        answer: "Sign in to the studio platform with Discord. Verified contributors vote on key story decisions, script elements, and community animation cuts to decide what makes the film.",
        startFrame: 220,
        peakStart: 245,
        peakEnd: 290,
        endFrame: 315
    },
    {
        id: 3,
        side: "right",
        question: "How can I contribute?",
        answer: "We need Blender animators, Blockbench modelers, voice actors, 2D artists, video editors, and sound designers. We don't take open writing, but the community gets to vote on key story elements and all animation shots are up for grabs in the Grab-box.",
        startFrame: 330,
        peakStart: 355,
        peakEnd: 400,
        endFrame: 425
    },
    {
        id: 4,
        side: "left",
        question: "How does the pipeline look?",
        answer: "It is pretty straightforward. You claim an open scene in the Grab-box, download the blend files and rigs, and animate your shot. Once you upload your pass, supervisors and the community review it. If it passes consensus, it gets affirmed straight into the master cut.",
        startFrame: 440,
        peakStart: 465,
        peakEnd: 510,
        endFrame: 535
    },
    {
        id: 5,
        side: "right",
        question: "Will this be free to watch?",
        answer: "Yes. The entire film will be released for free on YouTube on our official channel.",
        startFrame: 550,
        peakStart: 575,
        peakEnd: 620,
        endFrame: 645
    }
];

function calculateFaqMotion(
    currentFrame: number,
    start: number,
    peakStart: number,
    peakEnd: number,
    end: number,
    side: "right" | "left" | "center" = "center"
): { opacity: number; transform: string; pointerEvents: "auto" | "none"; visible: boolean } {
    if (currentFrame < start || currentFrame > end) {
        return { opacity: 0, transform: "none", pointerEvents: "none", visible: false };
    }

    let opacity = 1;
    let translateX = 0;
    let translateY = 0;
    const slideDistance = 140;

    if (currentFrame < peakStart) {
        const factor = (peakStart - currentFrame) / (peakStart - start);
        opacity = 1 - factor;
        if (side === "center") {
            translateY = factor * 30;
        } else {
            const sign = side === "right" ? 1 : -1;
            translateX = sign * factor * slideDistance;
        }
    } else if (currentFrame > peakEnd) {
        const factor = (currentFrame - peakEnd) / (end - peakEnd);
        opacity = 1 - factor;
        if (side === "center") {
            translateY = -factor * 30;
        } else {
            const sign = side === "right" ? 1 : -1;
            translateX = sign * factor * slideDistance;
        }
    }

    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    return {
        opacity: clampedOpacity,
        transform: `translate3d(${translateX}px, ${translateY}px, 0)`,
        pointerEvents: clampedOpacity > 0.3 ? "auto" : "none",
        visible: clampedOpacity > 0.005
    };
}

export default function LandingPage(): ReactNode {
    const [currentFrame, setCurrentFrame] = useState(1);

    useEffect(() => {
        const handleScroll = (): void => {
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            if (maxScroll <= 0) {
                return;
            }

            const rawProgress = Math.min(1, Math.max(0, scrollY / maxScroll));
            const frame = Math.min(TOTAL_FRAMES, Math.max(1, Math.round(1 + rawProgress * (TOTAL_FRAMES - 1))));

            setCurrentFrame(frame);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        document.addEventListener("scroll", handleScroll, { passive: true });
        window.addEventListener("resize", handleScroll, { passive: true });
        handleScroll();
        return () => {
            window.removeEventListener("scroll", handleScroll);
            document.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
        };
    }, []);

    // title split calculation: starts splitting after frame 12, fully parted by frame 90
    const splitProgress = Math.max(0, Math.min(1, (currentFrame - 12) / 78));
    const heroElementsOpacity = Math.max(0, 1 - splitProgress * 1.3);

    // finale visibility (frames 655 to 720)
    const finaleMotion = calculateFaqMotion(currentFrame, 650, 675, 720, 720);

    return (
        <div className="relative min-h-[7500px] w-full bg-zinc-950 text-zinc-100 select-none overflow-x-hidden">
            {/* hidden h1 heading for screen readers */}
            <h1 className="sr-only">Project Stairway</h1>

            {/* scroll-scrubbed canvas background */}
            <ScrollytellingCanvas currentFrame={currentFrame} totalFrames={TOTAL_FRAMES} dampeningOpacity={heroElementsOpacity} />

            {/* hero section: bigger split title and clean register now button */}
            <header className="fixed inset-0 z-20 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                <div className="relative flex flex-col items-center gap-8 sm:gap-10 w-full max-w-6xl">
                    <div className="flex flex-col items-center gap-4 sm:gap-5 w-full">
                        {/* cinematic eyebrow above title */}
                        <div
                            className="transition-all duration-75 ease-out select-none"
                            style={{
                                opacity: heroElementsOpacity,
                                transform: `translate3d(0, -${splitProgress * 20}px, 0)`
                            }}
                        >
                            <p className="text-[10px] sm:text-xs md:text-sm font-light tracking-[0.38em] sm:tracking-[0.48em] text-zinc-400 uppercase drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
                                AN INDEPENDENT MOTION PICTURE
                            </p>
                        </div>

                        {/* title split container */}
                        <div aria-hidden="true" className="relative flex items-center justify-center w-full px-2 sm:px-6">
                            {/* ambient cyan glow */}
                            <div
                                className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 h-56 w-[36rem] rounded-full bg-cyan-500/25 blur-3xl transition-opacity duration-75"
                                style={{ opacity: heroElementsOpacity }}
                            />

                            {/* left half: "PROJECT" */}
                            <div
                                className="relative flex justify-end will-change-transform transition-transform duration-75 ease-out"
                                style={{
                                    transform: `translate3d(-${splitProgress * 75}vw, 0, 0)`,
                                    opacity: 1 - splitProgress
                                }}
                            >
                                <Image
                                    src="/title-left.png"
                                    alt=""
                                    width={484}
                                    height={101}
                                    priority
                                    unoptimized
                                    className="h-10 sm:h-14 md:h-18 lg:h-22 w-auto object-contain select-none drop-shadow-[0_0_45px_rgba(0,229,255,0.45)]"
                                />
                            </div>

                            {/* right half: "STAIRWAY" */}
                            <div
                                className="relative flex justify-start will-change-transform transition-transform duration-75 ease-out"
                                style={{
                                    transform: `translate3d(${splitProgress * 75}vw, 0, 0)`,
                                    opacity: 1 - splitProgress
                                }}
                            >
                                <Image
                                    src="/title-right.png"
                                    alt=""
                                    width={526}
                                    height={101}
                                    priority
                                    unoptimized
                                    className="h-10 sm:h-14 md:h-18 lg:h-22 w-auto object-contain select-none drop-shadow-[0_0_45px_rgba(0,229,255,0.45)]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* clean register button with physical transparent design */}
                    <div
                        className="flex flex-col items-center transition-all duration-75 ease-out"
                        style={{
                            opacity: heroElementsOpacity,
                            transform: `translate3d(0, ${splitProgress * 25}px, 0)`,
                            pointerEvents: heroElementsOpacity > 0.2 ? "auto" : "none"
                        }}
                    >
                        <a
                            href="https://app.projectstairway.net"
                            className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.05] px-8 py-3 text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-zinc-200 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-150 hover:border-white/30 hover:bg-white/[0.1] hover:text-white active:translate-y-0.5 active:bg-white/[0.03] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                        >
                            Register Now
                        </a>
                    </div>
                </div>

                {/* scroll down indicator */}
                <div
                    className="absolute bottom-8 flex items-center justify-center transition-opacity duration-75 pointer-events-none"
                    style={{ opacity: heroElementsOpacity }}
                    aria-hidden="true"
                >
                    <div className="animate-breathe flex items-center justify-center">
                        <ChevronDown className="h-7 w-7 sm:h-8 sm:w-8 text-cyan-400 drop-shadow-[0_0_12px_rgba(0,229,255,0.65)] stroke-[2.25]" />
                    </div>
                </div>
            </header>

            {/* reworked faqs: alternating right/left with cool slide-in animations & minecraft font */}
            {FAQ_ITEMS.map((item) => {
                const motion = calculateFaqMotion(currentFrame, item.startFrame, item.peakStart, item.peakEnd, item.endFrame, item.side);

                if (!motion.visible) {
                    return null;
                }

                const isRight = item.side === "right";

                return (
                    <div
                        key={item.id}
                        className={`fixed inset-y-0 z-20 flex items-center p-6 sm:p-12 lg:p-24 w-full pointer-events-none transition-transform duration-75 ease-out ${
                            isRight ? "right-0 justify-end text-right" : "left-0 justify-start text-left"
                        }`}
                        style={{
                            opacity: motion.opacity,
                            transform: motion.transform,
                            pointerEvents: motion.pointerEvents
                        }}
                    >
                        <div
                            className={`relative flex flex-col max-w-xl sm:max-w-2xl ${
                                isRight ? "items-end text-right" : "items-start text-left"
                            }`}
                        >
                            {/* minecraft font question */}
                            <h2 className="font-minecraft text-2xl sm:text-4xl lg:text-5xl text-white tracking-wide uppercase leading-snug drop-shadow-[0_4px_24px_rgba(0,0,0,1)] [text-shadow:2px_2px_0_#000,4px_4px_0_rgba(0,0,0,0.85)]">
                                {item.question}
                            </h2>

                            {/* human answer with strong readability against undamped scenery */}
                            <p className="mt-4 sm:mt-6 text-sm sm:text-base lg:text-lg text-zinc-100 font-normal leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,1)] [text-shadow:1px_1px_0_#000]">
                                {item.answer}
                            </p>
                        </div>
                    </div>
                );
            })}

            {/* finale: join the community */}
            <div
                className="fixed inset-0 z-20 flex items-center justify-center p-6 text-center transition-transform duration-75 ease-out"
                style={{
                    opacity: finaleMotion.opacity,
                    transform: finaleMotion.transform,
                    pointerEvents: finaleMotion.pointerEvents
                }}
            >
                <div className="relative flex flex-col items-center max-w-2xl">
                    <span className="font-minecraft text-xs sm:text-sm uppercase tracking-[0.25em] text-cyan-400 mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] [text-shadow:1px_1px_0_#000]">
                        The Stairway is Open
                    </span>
                    <h2 className="font-minecraft text-3xl sm:text-5xl lg:text-6xl text-white uppercase tracking-wide leading-snug drop-shadow-[0_4px_30px_rgba(0,0,0,0.95)] [text-shadow:3px_3px_0_#000,5px_5px_0_rgba(0,0,0,0.85)]">
                        Shape The Story
                    </h2>
                    <p className="mt-4 text-base sm:text-lg text-zinc-200 leading-relaxed drop-shadow-[0_2px_20px_rgba(0,0,0,0.95)] [text-shadow:1px_1px_0_#000] max-w-xl">
                        Claim an open scene, give feedback on active cuts, and help make an animated film.
                    </p>

                    <div className="mt-8 flex flex-wrap items-center justify-center">
                        <a
                            href="https://discord.gg/WP7dhVzkaV"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-minecraft inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.05] px-8 py-3.5 text-xs sm:text-sm font-medium tracking-[0.2em] uppercase text-zinc-200 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_8px_rgba(0,0,0,0.4)] transition-all duration-150 hover:border-white/30 hover:bg-white/[0.1] hover:text-white active:translate-y-0.5 active:bg-white/[0.03] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 [text-shadow:1px_1px_0_rgba(0,0,0,0.8)]"
                        >
                            JOIN THE COMMUNITY
                        </a>
                    </div>
                </div>
            </div>

            {/* bottom pinned footer */}
            <div className="absolute bottom-0 left-0 right-0 z-30">
                <Footer />
            </div>
        </div>
    );
}
