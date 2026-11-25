"use client";

import { useId, type ReactNode } from "react";
import { APPLY_STATIONS, APP_URL, DISCORD_URL, GOAL_STATIONS, PIPELINE_STATIONS, REGISTER_STATIONS, YOUTUBE_URL } from "./content";

interface ButtonProps {
    readonly href: string;
    readonly label: string;
    readonly variant?: "primary" | "secondary";
    readonly external?: boolean;
}

function ActionButton({ href, label, variant = "primary", external = false }: ButtonProps): ReactNode {
    const styles =
        variant === "primary"
            ? "bg-[#2f87aa] text-white hover:bg-[#3a9bbf]"
            : "border border-white/25 bg-[#12081c]/75 text-white hover:border-white/55 hover:bg-[#1a0d28]/90";

    return (
        <a
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={`focus-ring inline-flex h-10 items-center justify-center rounded-md px-5 text-sm font-semibold transition-colors ${styles}`}
        >
            <span>{label}</span>
            {external && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
    );
}

function ConnectorDown({
    active,
    delayMs,
    responsive = false,
    widthClass = "w-11 sm:w-12"
}: {
    readonly active: boolean;
    readonly delayMs: number;
    readonly responsive?: boolean;
    readonly widthClass?: string;
}): ReactNode {
    const gradId = useId();

    return (
        <div
            data-active={active}
            aria-hidden="true"
            className={`justify-center py-0.5 ${widthClass} ${responsive ? "flex md:hidden" : "flex"}`}
        >
            <svg viewBox="0 0 16 28" className="h-7 w-4 overflow-visible">
                <defs>
                    <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="8" y1="5" x2="8" y2="22">
                        <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.95" />
                    </linearGradient>
                </defs>
                <polygon
                    points="8,0.5 10.2,2.7 8,4.9 5.8,2.7"
                    fill="#94a3b8"
                    fillOpacity="0.6"
                    className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
                />
                <path
                    d="M 8 5 L 8 22"
                    fill="none"
                    stroke={`url(#${gradId})`}
                    strokeWidth="1.25"
                    pathLength={100}
                    style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
                    className="blueprint-line"
                />
                <polygon
                    points="5.2,21 10.8,21 8,26.5"
                    fill="#e2e8f0"
                    className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDelay: active ? `${delayMs + 180}ms` : "0ms" }}
                />
            </svg>
        </div>
    );
}

function ConnectorRight({
    active,
    delayMs,
    compact = false
}: {
    readonly active: boolean;
    readonly delayMs: number;
    readonly compact?: boolean;
}): ReactNode {
    const gradId = useId();
    const widthClass = compact ? "w-6 lg:w-7 xl:w-9" : "w-9 lg:w-11";

    return (
        <div data-active={active} aria-hidden="true" className="hidden items-center md:mt-4 md:flex md:self-start">
            <svg viewBox="0 0 42 18" className={`h-4.5 shrink-0 overflow-visible ${widthClass}`}>
                <defs>
                    <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="4.5" y1="9" x2="35" y2="9">
                        <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#f1f5f9" stopOpacity="0.92" />
                    </linearGradient>
                </defs>
                <polygon
                    points="2.5,10 4.5,12 2.5,14 0.5,12"
                    fill="#94a3b8"
                    fillOpacity="0.55"
                    className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
                />
                <path
                    d="M 4.5 12 H 18 V 6 H 35"
                    fill="none"
                    stroke={`url(#${gradId})`}
                    strokeWidth="1.25"
                    strokeLinejoin="miter"
                    pathLength={100}
                    style={{ transitionDelay: active ? `${delayMs}ms` : "0ms" }}
                    className="blueprint-line"
                />
                <polygon
                    points="34,3.2 39.5,6 34,8.8"
                    fill="#e2e8f0"
                    className={`transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDelay: active ? `${delayMs + 180}ms` : "0ms" }}
                />
            </svg>
        </div>
    );
}

// custom monochrome architectural line graphics for GOAL
function GoalGraphic({ id }: { readonly id: string }): ReactNode {
    if (id === "blender") {
        return (
            <svg viewBox="0 0 56 56" fill="none" className="size-11 shrink-0 sm:size-13" aria-hidden="true">
                <rect
                    x="4"
                    y="10"
                    width="48"
                    height="36"
                    rx="2"
                    stroke="#7584b0"
                    strokeOpacity="0.65"
                    strokeWidth="1.4"
                    strokeDasharray="3 2"
                />
                <polygon points="28,16 39,22 28,28 17,22" fill="#ffffff" fillOpacity="0.08" stroke="#e2e8f0" strokeWidth="1.5" />
                <polygon points="17,22 28,28 28,40 17,34" fill="#4f6496" fillOpacity="0.22" stroke="#cbd5e1" strokeWidth="1.5" />
                <polygon points="39,22 28,28 28,40 39,34" fill="#2f87aa" fillOpacity="0.2" stroke="#cbd5e1" strokeWidth="1.5" />
            </svg>
        );
    }
    if (id === "votes") {
        return (
            <svg viewBox="0 0 56 56" fill="none" className="size-11 shrink-0 sm:size-13" aria-hidden="true">
                <line x1="8" y1="45" x2="48" y2="45" stroke="#7584b0" strokeOpacity="0.7" strokeWidth="1.5" />
                <rect x="11" y="29" width="9" height="16" fill="#464f98" fillOpacity="0.28" stroke="#8592bd" strokeWidth="1.4" />
                <rect x="23.5" y="20" width="9" height="25" fill="#2f87aa" fillOpacity="0.22" stroke="#9eb8cf" strokeWidth="1.4" />
                <rect x="36" y="11" width="9" height="34" fill="#ffffff" fillOpacity="0.12" stroke="#f1f5f9" strokeWidth="1.6" />
                <path d="M38.5 19l2 2 3.5-4" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="square" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 56 56" fill="none" className="size-11 shrink-0 sm:size-13" aria-hidden="true">
            <rect x="6" y="11" width="44" height="28" rx="2" fill="#140618" fillOpacity="0.55" stroke="#e2e8f0" strokeWidth="1.5" />
            <polygon points="24,19 24,31 35,25" fill="#f1f5f9" />
            <line x1="14" y1="45" x2="26" y2="45" stroke="#e2e8f0" strokeOpacity="0.75" strokeWidth="1.6" />
            <line x1="30" y1="45" x2="42" y2="45" stroke="#4b9cb3" strokeWidth="1.6" />
        </svg>
    );
}

// custom monochrome architectural icons for PIPELINE
function PipelineGraphic({ id }: { readonly id: string }): ReactNode {
    if (id === "vote") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
                <rect x="10" y="22" width="32" height="22" fill="#140618" fillOpacity="0.5" stroke="#cbd5e1" strokeWidth="1.5" />
                <line x1="18" y1="22" x2="34" y2="22" stroke="#4b9cb3" strokeWidth="2.2" />
                <path d="M26 7v14M20 14l6 7 6-7" stroke="#f1f5f9" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
        );
    }
    if (id === "brief") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
                <rect x="19" y="7" width="14" height="10" fill="#ffffff" fillOpacity="0.1" stroke="#e2e8f0" strokeWidth="1.5" />
                <path d="M26 17v7M11 24h30M11 24v7M26 24v7M41 24v7" stroke="#7584b0" strokeWidth="1.5" />
                <rect x="6" y="31" width="10" height="12" stroke="#cbd5e1" strokeWidth="1.4" />
                <rect x="21" y="31" width="10" height="12" stroke="#cbd5e1" strokeWidth="1.4" />
                <rect x="36" y="31" width="10" height="12" stroke="#4b9cb3" strokeWidth="1.5" />
            </svg>
        );
    }
    if (id === "animate") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
                <path d="M8 38 C 18 38, 22 14, 42 14" stroke="#e2e8f0" strokeWidth="1.6" fill="none" />
                <polygon points="8,34 12,38 8,42 4,38" fill="#464f98" stroke="#cbd5e1" strokeWidth="1.2" />
                <polygon points="42,10 46,14 42,18 38,14" fill="#4b9cb3" stroke="#ffffff" strokeWidth="1.1" />
                <rect x="29" y="29" width="15" height="14" rx="1.5" stroke="#94a3b8" strokeWidth="1.4" />
                <polygon points="34.5,33 34.5,39 40,36" fill="#e2e8f0" />
            </svg>
        );
    }
    if (id === "edit") {
        // staggered video/audio cut tracks crossed by vertical playhead marker
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
                <rect x="7" y="13" width="22" height="8" fill="#ffffff" fillOpacity="0.1" stroke="#e2e8f0" strokeWidth="1.4" />
                <rect x="33" y="13" width="12" height="8" stroke="#8592bd" strokeWidth="1.4" />
                <rect x="7" y="27" width="13" height="8" stroke="#8592bd" strokeWidth="1.4" />
                <rect x="24" y="27" width="21" height="8" fill="#4b9cb3" fillOpacity="0.18" stroke="#cbd5e1" strokeWidth="1.4" />
                <line x1="29" y1="8" x2="29" y2="42" stroke="#f1f5f9" strokeWidth="1.6" />
                <polygon points="26,8 32,8 29,12" fill="#f1f5f9" />
            </svg>
        );
    }
    if (id === "cut") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
                <rect x="6" y="12" width="40" height="28" fill="#140618" fillOpacity="0.5" stroke="#e2e8f0" strokeWidth="1.5" />
                <line x1="6" y1="18" x2="46" y2="18" stroke="#7584b0" strokeOpacity="0.7" strokeWidth="1.4" />
                <line x1="6" y1="34" x2="46" y2="34" stroke="#7584b0" strokeOpacity="0.7" strokeWidth="1.4" />
                <path d="M19 26l4 4 10-9" stroke="#ffffff" strokeWidth="2" strokeLinecap="square" />
            </svg>
        );
    }
    // premiere screen with broadcast signal arc
    return (
        <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 lg:size-11" aria-hidden="true">
            <rect x="7" y="14" width="38" height="24" rx="2" fill="#4b9cb3" fillOpacity="0.14" stroke="#e2e8f0" strokeWidth="1.5" />
            <polygon points="22,20 22,32 32,26" fill="#f1f5f9" />
            <line x1="17" y1="43" x2="35" y2="43" stroke="#9eb8cf" strokeWidth="1.6" />
            <path d="M19 9c4-3 10-3 14 0" stroke="#7584b0" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}

// custom monochrome schematics for REGISTER
function RegisterGraphic({ id }: { readonly id: string }): ReactNode {
    if (id === "discord") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-11 shrink-0 sm:size-12" aria-hidden="true">
                <rect x="7" y="10" width="38" height="27" rx="4" fill="#464f98" fillOpacity="0.22" stroke="#e2e8f0" strokeWidth="1.5" />
                <path d="M16 37l-5 7v-7" stroke="#e2e8f0" strokeWidth="1.5" strokeLinejoin="miter" />
                <circle cx="20" cy="23.5" r="2.5" fill="#cbd5e1" />
                <circle cx="32" cy="23.5" r="2.5" fill="#4b9cb3" />
            </svg>
        );
    }
    if (id === "studio") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-11 shrink-0 sm:size-12" aria-hidden="true">
                <rect x="7" y="10" width="38" height="32" rx="2" fill="#140618" fillOpacity="0.55" stroke="#cbd5e1" strokeWidth="1.5" />
                <line x1="7" y1="18" x2="45" y2="18" stroke="#7584b0" strokeOpacity="0.75" strokeWidth="1.4" />
                <circle cx="26" cy="27" r="4.5" stroke="#f1f5f9" strokeWidth="1.5" />
                <path d="M17 38c1.5-4 5-6 9-6s7.5 2 9 6" stroke="#9eb8cf" strokeWidth="1.5" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 52 52" fill="none" className="size-11 shrink-0 sm:size-12" aria-hidden="true">
            <path
                d="M26 7l15 6v12c0 10-6.5 16.5-15 20-8.5-3.5-15-10-15-20V13l15-6z"
                fill="#4b9cb3"
                fillOpacity="0.14"
                stroke="#e2e8f0"
                strokeWidth="1.6"
            />
            <path d="M19.5 25.5l4.5 4.5 8.5-8.5" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="square" />
        </svg>
    );
}

// custom monochrome schematics for APPLY department gating
function ApplyGraphic({ id }: { readonly id: string }): ReactNode {
    if (id === "craft") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 sm:size-12" aria-hidden="true">
                <rect x="8" y="10" width="10" height="10" stroke="#8592bd" strokeWidth="1.4" />
                <rect x="21" y="10" width="10" height="10" stroke="#cbd5e1" strokeWidth="1.4" />
                <rect x="34" y="10" width="10" height="10" fill="#4b9cb3" fillOpacity="0.2" stroke="#f1f5f9" strokeWidth="1.5" />
                <rect x="14" y="25" width="10" height="10" stroke="#cbd5e1" strokeWidth="1.4" />
                <rect x="28" y="25" width="10" height="10" stroke="#8592bd" strokeWidth="1.4" />
            </svg>
        );
    }
    if (id === "ticket") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 sm:size-12" aria-hidden="true">
                <path
                    d="M8 14h36v8a4 4 0 0 0 0 8v8H8v-8a4 4 0 0 0 0-8v-8z"
                    fill="#140618"
                    fillOpacity="0.5"
                    stroke="#cbd5e1"
                    strokeWidth="1.5"
                />
                <line x1="17" y1="23" x2="35" y2="23" stroke="#ffffff" strokeWidth="1.6" />
                <line x1="17" y1="29" x2="29" y2="29" stroke="#9eb8cf" strokeWidth="1.6" />
            </svg>
        );
    }
    if (id === "grant") {
        return (
            <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 sm:size-12" aria-hidden="true">
                <circle cx="19" cy="26" r="8" fill="#464f98" fillOpacity="0.25" stroke="#e2e8f0" strokeWidth="1.6" />
                <circle cx="19" cy="26" r="2.4" fill="#ffffff" />
                <path d="M27 26h17v6M38 26v5" stroke="#cbd5e1" strokeWidth="1.7" strokeLinecap="square" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 52 52" fill="none" className="size-10 shrink-0 sm:size-12" aria-hidden="true">
            <rect x="10" y="23" width="32" height="21" rx="2" fill="#4b9cb3" fillOpacity="0.16" stroke="#e2e8f0" strokeWidth="1.6" />
            <path d="M18 23v-6a8 8 0 0 1 15.2-3.4" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="square" />
            <polygon points="26,28 32,31 26,34 20,31" fill="#f1f5f9" />
        </svg>
    );
}

export function GoalInfographic({ active }: { readonly active: boolean }): ReactNode {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                {GOAL_STATIONS.map((station, index) => (
                    <div key={station.id}>
                        <div
                            style={{ transitionDelay: active ? `${120 + index * 110}ms` : "0ms" }}
                            className={`flex items-center gap-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity sm:gap-5 ${
                                active ? "translate-x-0 opacity-100" : "motion-safe:-translate-x-4 opacity-0"
                            }`}
                        >
                            <GoalGraphic id={station.id} />
                            <div>
                                <div className="text-legible text-lg font-bold tracking-wide text-white sm:text-xl">{station.label}</div>
                                <div className="text-legible text-sm font-medium text-[#d4dfee]">{station.tag}</div>
                            </div>
                        </div>
                        {index < GOAL_STATIONS.length - 1 && (
                            <ConnectorDown active={active} delayMs={180 + index * 110} widthClass="w-11 sm:w-13" />
                        )}
                    </div>
                ))}
            </div>

            <div
                style={{ transitionDelay: active ? "480ms" : "0ms" }}
                className={`pt-1 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-opacity ${
                    active ? "translate-y-0 opacity-100" : "motion-safe:translate-y-2 opacity-0"
                }`}
            >
                <ActionButton href={YOUTUBE_URL} label="Watch on YouTube" variant="secondary" external />
            </div>
        </div>
    );
}

export function PipelineInfographic({ active }: { readonly active: boolean }): ReactNode {
    return (
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-1.5">
            {PIPELINE_STATIONS.map((station, index) => (
                <div key={station.id} className="contents">
                    <div
                        style={{ transitionDelay: active ? `${120 + index * 85}ms` : "0ms" }}
                        className={`flex items-center gap-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity md:flex-col md:items-start md:gap-2.5 ${
                            active ? "translate-y-0 opacity-100" : "motion-safe:translate-y-4 opacity-0"
                        }`}
                    >
                        <PipelineGraphic id={station.id} />
                        <div>
                            <div className="text-legible text-base font-bold tracking-wide text-white whitespace-nowrap lg:text-lg">
                                {station.label}
                            </div>
                            <div className="text-legible text-xs font-medium text-[#d4dfee] whitespace-nowrap lg:text-sm">
                                {station.tag}
                            </div>
                        </div>
                    </div>
                    {index < PIPELINE_STATIONS.length - 1 && (
                        <>
                            <ConnectorDown active={active} delayMs={150 + index * 85} responsive widthClass="w-10" />
                            <ConnectorRight active={active} delayMs={160 + index * 85} compact />
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}

export function RegisterInfographic({ active }: { readonly active: boolean }): ReactNode {
    return (
        <div className="space-y-6">
            <div className="space-y-1">
                {REGISTER_STATIONS.map((station, index) => (
                    <div key={station.id}>
                        <div
                            style={{ transitionDelay: active ? `${120 + index * 110}ms` : "0ms" }}
                            className={`flex items-center gap-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity sm:gap-5 ${
                                active ? "translate-x-0 opacity-100" : "motion-safe:-translate-x-4 opacity-0"
                            }`}
                        >
                            <RegisterGraphic id={station.id} />
                            <div>
                                <div className="text-legible text-lg font-bold tracking-wide text-white sm:text-xl">{station.label}</div>
                                <div className="text-legible text-sm font-medium text-[#d4dfee]">{station.tag}</div>
                            </div>
                        </div>
                        {index < REGISTER_STATIONS.length - 1 && <ConnectorDown active={active} delayMs={180 + index * 110} />}
                    </div>
                ))}
            </div>

            <div
                style={{ transitionDelay: active ? "480ms" : "0ms" }}
                className={`flex flex-wrap gap-3 pt-1 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-opacity ${
                    active ? "translate-y-0 opacity-100" : "motion-safe:translate-y-2 opacity-0"
                }`}
            >
                <ActionButton href={APP_URL} label="Open Studio" variant="primary" />
                <ActionButton href={DISCORD_URL} label="Join Discord" variant="secondary" external />
            </div>
        </div>
    );
}

export function ApplyInfographic({ active }: { readonly active: boolean }): ReactNode {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3 lg:gap-4">
                {APPLY_STATIONS.map((station, index) => (
                    <div key={station.id} className="contents">
                        <div
                            style={{ transitionDelay: active ? `${120 + index * 100}ms` : "0ms" }}
                            className={`flex items-center gap-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-opacity md:flex-col md:items-start md:gap-2.5 ${
                                active ? "translate-y-0 opacity-100" : "motion-safe:translate-y-3 opacity-0"
                            }`}
                        >
                            <ApplyGraphic id={station.id} />
                            <div>
                                <div className="text-legible text-base font-bold tracking-wide text-white sm:text-lg">{station.label}</div>
                                <div className="text-legible text-xs font-medium text-[#d4e0ee] sm:text-sm">{station.tag}</div>
                            </div>
                        </div>
                        {index < APPLY_STATIONS.length - 1 && (
                            <>
                                <ConnectorDown active={active} delayMs={160 + index * 100} responsive widthClass="w-10 sm:w-12" />
                                <ConnectorRight active={active} delayMs={180 + index * 100} />
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div
                style={{ transitionDelay: active ? "500ms" : "0ms" }}
                className={`flex flex-wrap gap-3 transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-opacity ${
                    active ? "translate-y-0 opacity-100" : "motion-safe:translate-y-2 opacity-0"
                }`}
            >
                <ActionButton href={APP_URL} label="Register Now" variant="primary" />
                <ActionButton href={`${APP_URL}/positions`} label="Open Positions" variant="secondary" />
            </div>
        </div>
    );
}
