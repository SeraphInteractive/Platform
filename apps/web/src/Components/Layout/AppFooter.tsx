"use client";

// import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// const partners = [
//     { label: "Prism Nodes", href: "https://prismnodes.com/" },
//     { label: "Squared Media", href: "https://www.youtube.com/@SquaredMediaYT" },
//     { label: "Seraph Interactive", href: "https://seraphinteractive.com/" }
// ] as const;

export function AppFooter(): ReactNode {
    return (
        <footer className="mt-auto border-t text-xs text-muted-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>&copy; {new Date().getFullYear()} Project Stairway</span>
                    <span className="hidden sm:inline">·</span>
                    <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
                    <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
                    <Link href="/legal/acceptable-use" className="hover:text-foreground">Acceptable use</Link>
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
