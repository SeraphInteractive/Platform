"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSiteConfig } from "@/Components/SiteConfig";

const partners = [
    { label: "Prism Nodes", href: "https://prismnodes.com/" },
    { label: "Squared Media", href: "https://www.youtube.com/@SquaredMediaYT" },
    { label: "Seraph Interactive", href: "https://seraphinteractive.com/" }
] as const;

export function AppFooter(): ReactNode {
    const { discordInviteUrl } = useSiteConfig();

    return (
        <footer className="mt-auto border-t bg-card/40 text-xs text-muted-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
                <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
                    <div className="space-y-1.5">
                        <p className="font-semibold text-foreground">Project Stairway</p>
                        <p className="max-w-sm text-muted-foreground">
                            A Minecraft-inspired animated film made by its community.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-8">
                        <div className="space-y-2">
                            <p className="font-medium text-foreground">Community</p>
                            <ul className="space-y-1.5">
                                <li>
                                    <a
                                        href="https://www.youtube.com/@ProjectStairwayMovie"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 hover:text-foreground"
                                    >
                                        YouTube
                                        <ExternalLink className="size-3" />
                                    </a>
                                </li>
                                {discordInviteUrl !== null && (
                                    <li>
                                        <a
                                            href={discordInviteUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 hover:text-foreground"
                                        >
                                            Discord
                                            <ExternalLink className="size-3" />
                                        </a>
                                    </li>
                                )}
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <p className="font-medium text-foreground">Legal</p>
                            <ul className="space-y-1.5">
                                <li>
                                    <Link href="/legal/terms" className="hover:text-foreground">
                                        Terms
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/legal/privacy" className="hover:text-foreground">
                                        Privacy
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/legal/acceptable-use" className="hover:text-foreground">
                                        Acceptable use
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                        <span className="font-medium text-foreground">Partners:</span>
                        {partners.map((partner) => (
                            <a
                                key={partner.href}
                                href={partner.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                                {partner.label}
                                <ExternalLink className="size-3" />
                            </a>
                        ))}
                    </div>
                    <p className="text-muted-foreground">
                        &copy; {new Date().getFullYear()} Project Stairway
                    </p>
                </div>
            </div>
        </footer>
    );
}
