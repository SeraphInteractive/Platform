"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { SECTIONS } from "./content";
import { useStage } from "./stage";

export function BackgroundMedia(): ReactNode {
    const { activeIndex } = useStage();

    return (
        <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden bg-[#0d0512]">
            {SECTIONS.map((section, index) => {
                const isActive = index === activeIndex;
                const isPast = index < activeIndex;

                return (
                    <div
                        key={section.id}
                        className={`absolute inset-0 transition-[opacity,transform] duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-300 ${
                            isActive
                                ? "z-10 translate-y-0 scale-100 opacity-100"
                                : isPast
                                  ? "z-0 opacity-0 motion-safe:-translate-y-4 motion-safe:scale-[1.035]"
                                  : "z-0 opacity-0 motion-safe:translate-y-4 motion-safe:scale-100"
                        }`}
                    >
                        {section.mobileBgSrc ? (
                            <>
                                <Image
                                    src={section.bgSrc}
                                    alt=""
                                    fill
                                    priority={index === 0}
                                    loading="eager"
                                    unoptimized
                                    sizes="100vw"
                                    className="hidden object-cover object-center md:block"
                                />
                                {/* mobile: brief horizontal glitch tear from sunset art into full-bleed wireframe */}
                                <div
                                    key={isActive ? "pipeline-active" : "pipeline-idle"}
                                    className={`absolute inset-0 md:hidden ${isActive ? "pipeline-glitch-active" : ""}`}
                                >
                                    <Image
                                        src={section.mobileBgSrc}
                                        alt=""
                                        fill
                                        loading="eager"
                                        unoptimized
                                        sizes="100vw"
                                        className="pipeline-glitch-wireframe object-cover object-center"
                                    />
                                    <Image
                                        src={section.bgSrc}
                                        alt=""
                                        fill
                                        loading="eager"
                                        unoptimized
                                        sizes="100vw"
                                        className="pipeline-glitch-sunset object-cover object-center"
                                    />
                                    <Image
                                        src={section.mobileBgSrc}
                                        alt=""
                                        fill
                                        loading="eager"
                                        unoptimized
                                        sizes="100vw"
                                        className="pipeline-glitch-slice object-cover object-center brightness-125 contrast-125"
                                    />
                                </div>
                            </>
                        ) : (
                            <Image
                                src={section.bgSrc}
                                alt=""
                                fill
                                priority={index === 0}
                                loading="eager"
                                unoptimized
                                sizes="100vw"
                                className="object-cover object-center"
                            />
                        )}
                        {section.scrimClass && <div className={`pointer-events-none absolute inset-0 ${section.scrimClass}`} />}
                    </div>
                );
            })}
        </div>
    );
}
