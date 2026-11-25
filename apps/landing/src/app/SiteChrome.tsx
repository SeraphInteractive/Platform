"use client";

import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { DISCORD_URL, LEGAL_LINKS, PARTNERS, SECTIONS, YOUTUBE_URL } from "./content";
import { useStage } from "./stage";

const NAV_SECTIONS = SECTIONS.filter((section) => section.id !== "home");
const HOME_ID = "home";

export function SiteChrome(): ReactNode {
    const { activeIndex, activeId, goTo } = useStage();
    const pastHero = activeIndex > 0;
    const isEndScreen = activeId === "apply";

    const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, targetId: string) => {
        event.preventDefault();
        goTo(targetId);
    };

    return (
        <>
            {/* right-edge luminance buffer past hero so cascade links stay crisp */}
            <div
                aria-hidden="true"
                className={`pointer-events-none fixed inset-y-0 right-0 z-20 hidden w-72 bg-linear-to-l from-[#0d0512]/60 via-[#12081c]/22 to-transparent transition-opacity duration-500 md:block ${
                    pastHero ? "opacity-100" : "opacity-0"
                }`}
            />

            {/* desktop: cascading right-side chapter index revealed past the hero */}
            <nav
                aria-label="Page sections"
                aria-hidden={!pastHero}
                className={`fixed top-1/2 right-7 z-30 hidden -translate-y-1/2 flex-col items-end gap-2.5 lg:right-12 md:flex ${
                    pastHero ? "pointer-events-auto" : "pointer-events-none"
                }`}
            >
                <ul className="flex flex-col items-end gap-2">
                    {NAV_SECTIONS.map((section, index) => {
                        const isActive = pastHero && activeId === section.id;
                        const delayMs = pastHero ? index * 80 : (NAV_SECTIONS.length - 1 - index) * 40;

                        return (
                            <li
                                key={section.id}
                                style={{ transitionDelay: `${delayMs}ms` }}
                                className={`transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity ${
                                    pastHero ? "translate-x-0 opacity-100" : "motion-safe:translate-x-8 opacity-0"
                                }`}
                            >
                                <a
                                    href={`#${section.id}`}
                                    onClick={(e) => handleNavClick(e, section.id)}
                                    tabIndex={pastHero ? 0 : -1}
                                    aria-current={isActive ? "location" : undefined}
                                    className="group focus-ring flex items-center justify-end gap-3.5 rounded-sm py-1 pl-4 text-right"
                                >
                                    <span
                                        className={`origin-right text-2xl leading-none font-black tracking-[0.06em] uppercase transition-[color,transform,opacity] duration-300 ease-out lg:text-[28px] ${
                                            isActive
                                                ? "text-white motion-safe:-translate-x-1.5 [text-shadow:0_2px_16px_rgba(13,5,18,0.95)]"
                                                : "text-[#c4cbe6]/45 group-hover:text-white/85 motion-safe:group-hover:-translate-x-0.5 [text-shadow:0_1px_10px_rgba(13,5,18,0.85)]"
                                        }`}
                                    >
                                        {section.label}
                                    </span>
                                    <span className="flex w-7 shrink-0 items-center justify-end" aria-hidden="true">
                                        <span
                                            className={`block rounded-full transition-[width,background-color] duration-300 ease-out ${
                                                isActive
                                                    ? "h-[2.5px] w-7 bg-[#3a9cb8]"
                                                    : "h-[1.5px] w-2.5 bg-[#6e7ba6]/45 group-hover:w-4 group-hover:bg-white/75"
                                            }`}
                                        />
                                    </span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* mobile: clean bare chapter strip pinned subtly at top past hero */}
            <nav
                aria-label="Page sections"
                aria-hidden={!pastHero}
                className={`fixed inset-x-0 top-0 z-30 flex justify-center bg-linear-to-b from-[#0d0512]/80 via-[#0d0512]/35 to-transparent px-4 pt-3.5 pb-4 transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity md:hidden ${
                    pastHero ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none motion-safe:-translate-y-3 opacity-0"
                }`}
            >
                <ul className="flex items-center justify-center gap-5">
                    {NAV_SECTIONS.map((section) => {
                        const isActive = pastHero && activeId === section.id;
                        return (
                            <li key={section.id}>
                                <a
                                    href={`#${section.id}`}
                                    onClick={(e) => handleNavClick(e, section.id)}
                                    tabIndex={pastHero ? 0 : -1}
                                    aria-current={isActive ? "location" : undefined}
                                    className="focus-ring relative flex flex-col items-center pb-1.5 text-[11px] font-bold tracking-[0.14em] uppercase [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] transition-colors"
                                >
                                    <span className={isActive ? "text-white" : "text-white/40 hover:text-white/80"}>{section.label}</span>
                                    <span
                                        aria-hidden="true"
                                        className={`mt-1 h-[2px] rounded-full transition-all duration-300 ${
                                            isActive ? "w-full bg-[#3a9cb8]" : "w-0 bg-transparent"
                                        }`}
                                    />
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* persistent bottom anchor with exclusive partner footer band on the final APPLY view */}
            <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-linear-to-t from-[#09030d]/92 via-[#0d0512]/55 to-transparent px-4 pt-6 pb-3 sm:px-6 sm:pb-4">
                <div
                    aria-hidden={!isEndScreen}
                    className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity ${
                        isEndScreen ? "pointer-events-auto grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
                    }`}
                >
                    <div className="overflow-hidden">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-white/12 pb-2.5 sm:mb-3 sm:pb-3">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:gap-x-5">
                                <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-white/55 uppercase">
                                    Partnered by
                                </span>
                                <ul className="flex flex-wrap items-center gap-4 sm:gap-5">
                                    {PARTNERS.map((partner) => (
                                        <li key={partner.name}>
                                            <a
                                                href={partner.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                tabIndex={isEndScreen ? 0 : -1}
                                                className="focus-ring block rounded-sm opacity-85 transition-opacity hover:opacity-100"
                                            >
                                                <Image
                                                    src={partner.src}
                                                    alt={partner.name}
                                                    width={partner.width}
                                                    height={partner.height}
                                                    className="h-4.5 w-auto sm:h-6"
                                                />
                                                <span className="sr-only"> (opens in a new tab)</span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] font-medium text-white/60 sm:gap-x-4 sm:text-[11px]">
                                <li>
                                    <a
                                        href={DISCORD_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        tabIndex={isEndScreen ? 0 : -1}
                                        className="focus-ring rounded-sm transition-colors hover:text-white"
                                    >
                                        Discord
                                        <span className="sr-only"> (opens in a new tab)</span>
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href={YOUTUBE_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        tabIndex={isEndScreen ? 0 : -1}
                                        className="focus-ring rounded-sm transition-colors hover:text-white"
                                    >
                                        YouTube
                                        <span className="sr-only"> (opens in a new tab)</span>
                                    </a>
                                </li>
                                {LEGAL_LINKS.map((link) => (
                                    <li key={link.href}>
                                        <a
                                            href={link.href}
                                            tabIndex={isEndScreen ? 0 : -1}
                                            className="focus-ring rounded-sm transition-colors hover:text-white"
                                        >
                                            {link.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <a
                        href={`#${HOME_ID}`}
                        onClick={(e) => handleNavClick(e, HOME_ID)}
                        className="pointer-events-auto focus-ring flex select-none items-center gap-2 rounded-sm transition-opacity hover:opacity-90 sm:gap-2.5"
                        aria-label="Back to top"
                    >
                        <svg
                            viewBox="0 0 821 786"
                            fill="currentColor"
                            className="size-6 shrink-0 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] sm:size-7"
                            aria-hidden="true"
                        >
                            <path d="M339.125 261.937C341.977 270.746 352.015 274.888 360.211 270.636L804.011 40.4393C815.427 34.5176 826.182 49.393 817.038 58.4578L414.651 457.373C409.328 462.65 408.708 471.064 413.198 477.071L629.613 766.583C636.563 775.881 626.253 789.341 615.417 785.244C548.267 759.857 434.815 721.462 376.873 702.058C356.131 695.112 343.886 673.616 346.647 651.837C355.714 580.306 361.701 429.84 259.317 394.121C201.088 373.807 167.637 381.607 148.42 397.117C136.172 407.003 101.85 410.08 94.8771 395.94L1.22598 206.007C-3.86475 195.683 7.94116 185.253 17.4923 191.637L131.415 267.78C139.658 273.289 150.863 269.378 153.924 259.921L235.532 7.78086C238.889 -2.59359 253.507 -2.59363 256.865 7.78082L339.125 261.937Z" />
                        </svg>
                        <div className="flex flex-col text-left leading-none tracking-tight">
                            <span className="text-[12px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[13px]">
                                Seraph
                            </span>
                            <span className="text-[10px] font-medium text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[11px]">
                                Interactive
                            </span>
                        </div>
                    </a>
                    <p className="select-none text-[9.5px] leading-tight font-normal tracking-wide text-white/65 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[11px]">
                        Copyright 2026, Project Stairway, Seraph Interactive - All rights Reserved.
                    </p>
                </div>
            </footer>
        </>
    );
}
