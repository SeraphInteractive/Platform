"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function SeraphLogo({ className }: { className?: string }): ReactNode {
    return (
        <svg viewBox="0 0 821 786" fill="currentColor" className={className} aria-hidden="true">
            <path d="M339.125 261.937C341.977 270.746 352.015 274.888 360.211 270.636L804.011 40.4393C815.427 34.5176 826.182 49.393 817.038 58.4578L414.651 457.373C409.328 462.65 408.708 471.064 413.198 477.071L629.613 766.583C636.563 775.881 626.253 789.341 615.417 785.244C548.267 759.857 434.815 721.462 376.873 702.058C356.131 695.112 343.886 673.616 346.647 651.837C355.714 580.306 361.701 429.84 259.317 394.121C201.088 373.807 167.637 381.607 148.42 397.117C136.172 407.003 101.85 410.08 94.8771 395.94L1.22598 206.007C-3.86475 195.683 7.94116 185.253 17.4923 191.637L131.415 267.78C139.658 273.289 150.863 269.378 153.924 259.921L235.532 7.78086C238.889 -2.59359 253.507 -2.59363 256.865 7.78082L339.125 261.937Z" />
        </svg>
    );
}

export function AppFooter(): ReactNode {
    return (
        <footer className="mt-auto border-t text-xs text-muted-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                    <SeraphLogo className="size-3.5 shrink-0" />
                    <span>&copy; {new Date().getFullYear()} Seraph Interactive, Inc.</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link href="/legal/terms" className="hover:text-foreground">
                        Terms
                    </Link>
                    <Link href="/legal/privacy" className="hover:text-foreground">
                        Privacy
                    </Link>
                    <Link href="/legal/acceptable-use" className="hover:text-foreground">
                        Acceptable use
                    </Link>
                </div>
                {/* <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {partners.map((partner, i) => (
                        <span key={partner.href} className="inline-flex items-center gap-1">
                            {i > 0 && <span className="mr-1.5">·</span>}
                            <a
                                href={partner.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                                {partner.label}
                                <ExternalLink className="size-3" />
                            </a>
                        </span>
                    ))}
                </div> */}
            </div>
        </footer>
    );
}
