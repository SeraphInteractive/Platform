export function safeHttpUrl(value: string | null): string | null {
    if (value === null) {
        return null;
    }
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}
