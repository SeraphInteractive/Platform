export const DEFAULT_ANNOUNCEMENT_VIDEO_URL = "https://www.youtube-nocookie.com/embed/mSP3Z3_0JPo";

export function getAnnouncementEmbedUrl(rawUrl?: string): string {
    const input = rawUrl ?? process.env.NEXT_PUBLIC_ANNOUNCEMENT_VIDEO_URL;
    if (!input || input.trim() === "") {
        return DEFAULT_ANNOUNCEMENT_VIDEO_URL;
    }

    try {
        if (input.includes("/embed/")) {
            return input;
        }

        const parsed = new URL(input);
        if (parsed.hostname === "youtu.be" || parsed.hostname.endsWith(".youtu.be")) {
            const videoId = parsed.pathname.replace(/^\//, "");
            if (videoId) {
                return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
            }
        }

        const videoId = parsed.searchParams.get("v");
        if (videoId) {
            return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
        }

        return input;
    } catch {
        return DEFAULT_ANNOUNCEMENT_VIDEO_URL;
    }
}
