import type { ReactNode } from "react";

export interface VideoPlayerProps {
    readonly src: string;
    readonly title?: string;
    readonly className?: string;
}

export function VideoPlayer({
    src,
    title = "Project Stairway announcement video",
    className = "",
}: VideoPlayerProps): ReactNode {
    return (
        <div className={`relative aspect-video w-full overflow-hidden rounded-xl border border-border/80 bg-black shadow-xl ${className}`}>
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
