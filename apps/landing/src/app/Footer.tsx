"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export function Footer(): ReactNode {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="relative z-10 w-full border-t border-zinc-900 bg-[#0c0d11]/95 text-zinc-400 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-6 sm:px-10 py-12 lg:py-16">
                <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-12">
                    {/* Left: Brand info with official title graphic */}
                    <div className="flex flex-col justify-between space-y-6 lg:col-span-6">
                        <div className="space-y-3">
                            <Image
                                src="/stairway-title.png"
                                alt="Project Stairway"
                                width={1010}
                                height={101}
                                unoptimized
                                className="h-7 sm:h-8 w-auto object-contain select-none"
                            />
                            <p className="text-xs text-zinc-500 font-mono tracking-wide max-w-sm">A community film project.</p>
                        </div>

                        <div className="space-y-4 pt-4 lg:pt-0">
                            <div className="flex items-center gap-4 text-zinc-400">
                                <a
                                    href="https://discord.gg/WP7dhVzkaV"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Discord"
                                    className="transition-colors hover:text-white"
                                >
                                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                    </svg>
                                </a>
                                <a
                                    href="https://www.youtube.com/@ProjectStairwayMovie"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="YouTube"
                                    className="transition-colors hover:text-white"
                                >
                                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                                    </svg>
                                </a>
                            </div>
                            <div className="space-y-2.5">
                                <Image
                                    src="/wordmark.svg"
                                    alt="Seraph Interactive"
                                    width={2902}
                                    height={786}
                                    unoptimized
                                    className="h-5 w-auto object-contain opacity-65"
                                />
                                <p className="text-[11px] text-zinc-500 font-mono">
                                    Copyright {currentYear} Project Stairway. All rights reserved.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Middle: Legal */}
                    <div className="space-y-3 lg:col-span-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 font-sans">Legal</h3>
                        <ul className="space-y-2 text-xs">
                            <li>
                                <a
                                    href="https://app.projectstairway.net/legal/terms"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-400 transition-colors hover:text-white"
                                >
                                    Terms of Service
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://app.projectstairway.net/legal/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-400 transition-colors hover:text-white"
                                >
                                    Privacy Policy
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://app.projectstairway.net/legal/acceptable-use"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-zinc-400 transition-colors hover:text-white"
                                >
                                    Acceptable Use
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Right: Partners */}
                    <div className="space-y-4 lg:col-span-3 lg:pl-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200 font-sans">Partners</h3>
                        <div className="flex flex-col items-start gap-4">
                            {/* Squared Media */}
                            <a
                                href="https://squaredmedia.org"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Squared Media"
                                className="group flex items-center transition-opacity hover:opacity-100 opacity-80"
                            >
                                <Image
                                    src="/partners/sqm.png"
                                    alt="Squared Media"
                                    width={469}
                                    height={186}
                                    unoptimized
                                    className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
                                />
                            </a>

                            {/* Prism Nodes underneath */}
                            <a
                                href="https://prismnodes.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Prism Nodes"
                                className="group flex items-center transition-opacity hover:opacity-100 opacity-80"
                            >
                                <Image
                                    src="/partners/prismnodes.png"
                                    alt="Prism Nodes"
                                    width={640}
                                    height={190}
                                    unoptimized
                                    className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
                                />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
