"use client";

import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { ApplyInfographic, GoalInfographic, PipelineInfographic, RegisterInfographic } from "./infographics";
import { useStage } from "./stage";

interface StageSlideProps {
    readonly index: number;
    readonly id: string;
    readonly labelledBy: string;
    readonly className?: string;
    readonly children: ReactNode;
}

function StageSlide({ index, id, labelledBy, className = "", children }: StageSlideProps): ReactNode {
    const { activeIndex } = useStage();
    const isActive = index === activeIndex;
    const isAbove = index < activeIndex;

    return (
        <section
            id={id}
            aria-labelledby={labelledBy}
            aria-hidden={!isActive}
            inert={!isActive}
            className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity motion-reduce:duration-300 ${
                isActive
                    ? "pointer-events-auto z-10 translate-y-0 opacity-100"
                    : isAbove
                      ? "pointer-events-none z-0 opacity-0 motion-safe:-translate-y-8"
                      : "pointer-events-none z-0 opacity-0 motion-safe:translate-y-8"
            } ${className}`}
        >
            {children}
        </section>
    );
}

export default function LandingPage(): ReactNode {
    const { activeIndex, goTo } = useStage();

    const handleLearnMore = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        goTo(1);
    };

    return (
        <main id="main" tabIndex={-1} className="relative isolate z-10 h-dvh w-full overflow-hidden outline-none">
            {/* 0: home */}
            <StageSlide index={0} id="home" labelledBy="home-heading" className="flex flex-col items-center">
                {/* optical center in the upper sky mist above the stairway horizon */}
                <div className="flex h-[51dvh] w-full items-end justify-center px-5 pb-1 sm:px-8">
                    <div className="w-full max-w-[840px] text-center">
                        <h1 id="home-heading">
                            <Image
                                src="/brand/title.png"
                                alt="Project Stairway"
                                width={2021}
                                height={203}
                                priority
                                unoptimized
                                className="mx-auto h-auto w-full drop-shadow-[0_6px_22px_rgba(13,5,18,0.45)]"
                            />
                        </h1>
                    </div>
                </div>

                {/* borderless slate ink fades softly into the bright cloud mist */}
                <div className="flex w-full justify-center px-4 pt-2.5 sm:px-8 sm:pt-3">
                    <p className="whitespace-nowrap bg-linear-to-b from-[#0e2138]/82 to-[#2a4c70]/68 bg-clip-text text-center text-[clamp(7.2px,2.15vw,13px)] font-semibold tracking-[0.12em] text-transparent uppercase drop-shadow-[0_0_12px_rgba(235,244,252,0.75)] sm:tracking-[0.28em]">
                        A Community Centered Independent Motion Picture
                    </p>
                </div>

                <div className="flex flex-1 items-end justify-center pb-24 sm:pb-12">
                    <a
                        href="#goal"
                        onClick={handleLearnMore}
                        aria-label="Scroll to learn more about Project Stairway"
                        className="group focus-ring flex flex-col items-center gap-2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(13,5,18,0.52)_0%,transparent_72%)] px-8 py-2.5 transition-transform duration-300 hover:translate-y-0.5"
                    >
                        <span className="text-[11px] font-semibold tracking-[0.3em] text-white/90 uppercase [text-shadow:0_2px_12px_rgba(13,5,18,0.95),0_0_20px_rgba(13,5,18,0.8)] transition-colors duration-300 group-hover:text-white">
                            Learn More
                        </span>
                        <span className="flex flex-col items-center" aria-hidden="true">
                            <span className="scroll-stem h-3.5 w-px bg-linear-to-b from-white/75 to-transparent" />
                            <svg
                                viewBox="0 0 20 18"
                                fill="none"
                                className="-mt-0.5 size-4 text-white/85 drop-shadow-[0_2px_6px_rgba(13,5,18,0.9)] transition-colors duration-300 group-hover:text-[#7ac4db]"
                            >
                                <path
                                    d="M4 3L10 9L16 3"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="square"
                                    className="scroll-chevron-1"
                                />
                                <path
                                    d="M4 9.5L10 15.5L16 9.5"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="square"
                                    className="scroll-chevron-2"
                                />
                            </svg>
                        </span>
                    </a>
                </div>
            </StageSlide>

            {/* 1: goal - visual diagram along left cliff leaving sakura arch open */}
            <StageSlide index={1} id="goal" labelledBy="goal-heading" className="flex items-center">
                <div
                    data-section-scroll="true"
                    className="max-h-dvh w-full overflow-y-auto px-5 pt-16 pb-24 sm:px-8 md:py-20 md:pr-52 md:pl-12 lg:pl-16"
                >
                    <div className="max-w-md space-y-6 sm:space-y-8">
                        <h2
                            id="goal-heading"
                            className="text-legible text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl"
                        >
                            The Goal
                        </h2>

                        <GoalInfographic active={activeIndex === 1} />
                    </div>
                </div>
            </StageSlide>

            {/* 2: pipeline - top-left sky heading + bottom horizon assembly diagram framing the windmill */}
            <StageSlide index={2} id="pipeline" labelledBy="pipeline-heading" className="flex">
                <div
                    data-section-scroll="true"
                    className="flex max-h-dvh w-full flex-col justify-between overflow-y-auto px-5 pt-20 pb-24 sm:px-8 md:pt-14 md:pr-52 md:pb-24 md:pl-12 lg:pr-56 lg:pl-16"
                >
                    <h2
                        id="pipeline-heading"
                        className="text-legible text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl"
                    >
                        Pipeline
                    </h2>

                    <div className="my-auto py-6 md:my-0 md:max-w-[92%] md:py-0 xl:max-w-[88%]">
                        <PipelineInfographic active={activeIndex === 2} />
                    </div>
                </div>
            </StageSlide>

            {/* 3: register - identity unlock diagram framed inside dark left cavern wall */}
            <StageSlide index={3} id="register" labelledBy="register-heading" className="flex items-center">
                <div
                    data-section-scroll="true"
                    className="max-h-dvh w-full overflow-y-auto px-5 pt-16 pb-24 sm:px-8 md:py-20 md:pr-52 md:pl-10 lg:pl-14"
                >
                    <div className="max-w-sm space-y-6 sm:space-y-8">
                        <h2
                            id="register-heading"
                            className="text-legible text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl"
                        >
                            Register
                        </h2>

                        <RegisterInfographic active={activeIndex === 3} />
                    </div>
                </div>
            </StageSlide>

            {/* 4: apply - grounded in darker foreground shadow below skylight burst & clear of reactor golem */}
            <StageSlide index={4} id="apply" labelledBy="apply-heading" className="flex items-center md:items-end">
                <div
                    data-section-scroll="true"
                    className="max-h-dvh w-full overflow-y-auto px-5 pt-20 pb-36 sm:px-8 md:pt-14 md:pr-52 md:pb-38 md:pl-12 lg:pl-16"
                >
                    <div className="max-w-3xl space-y-6 sm:space-y-7">
                        <h2
                            id="apply-heading"
                            className="text-legible text-3xl font-extrabold tracking-wide text-white uppercase sm:text-4xl"
                        >
                            Apply
                        </h2>

                        <ApplyInfographic active={activeIndex === 4} />
                    </div>
                </div>
            </StageSlide>
        </main>
    );
}
