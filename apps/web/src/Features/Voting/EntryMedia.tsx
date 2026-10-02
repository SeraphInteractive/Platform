import type { ReactNode } from "react";
import { cn } from "@/Lib/Utils";

const imagePattern = /\.(?:png|jpe?g|gif|webp)$/iu;
const videoPattern = /\.(?:mp4|webm|mov)$/iu;

function mediaKind(url: string): "image" | "video" | null {
    let pathname: string;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            return null;
        }
        pathname = parsed.pathname;
    } catch {
        return null;
    }
    if (imagePattern.test(pathname)) {
        return "image";
    }
    return videoPattern.test(pathname) ? "video" : null;
}

interface EntryMediaProps {
    readonly url: string | null;
    readonly title: string;
    readonly className?: string;
    readonly controls?: boolean;
}

export function EntryMedia({ url, title, className, controls = true }: EntryMediaProps): ReactNode {
    if (url === null) {
        return null;
    }
    const kind = mediaKind(url);
    const frame = cn("bg-muted aspect-video w-full overflow-hidden border object-cover", className);
    if (kind === "image") {
        return <img src={url} alt={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={frame} />;
    }
    if (kind === "video") {
        return <video src={url} controls={controls} preload="metadata" playsInline className={frame} aria-label={title} />;
    }
    return null;
}
