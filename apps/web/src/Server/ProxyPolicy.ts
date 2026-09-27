const segmentPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const blockedRoots: ReadonlySet<string> = new Set(["auth", "notifications"]);

export function isProxyablePath(segments: readonly string[]): boolean {
    if (segments.length === 0 || segments.length > 8 || !segments.every((segment) => segmentPattern.test(segment))) {
        return false;
    }
    const [root] = segments;
    return root !== undefined && !blockedRoots.has(root);
}
