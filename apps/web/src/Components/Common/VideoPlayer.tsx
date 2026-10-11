import type { ReactNode } from "react";

export interface VideoPlayerProps {
    readonly src: string;
    readonly title?: string;
    readonly className?: string;
}

export function VideoPlayer({ src, title = "Project Stairway announcement video", className = "" }: VideoPlayerProps): ReactNode {
    return (
        <div
            className={`relative aspect-video w-full overflow-hidden rounded-xl border border-white/[0.1] bg-black shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_12px_36px_-4px_rgba(0,0,0,0.7)] ${className}`}
        >
            <iframe
                src={src}
                title={title}
                className="absolute inset-0 h-full w-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
            />
        </div>
    );
}
