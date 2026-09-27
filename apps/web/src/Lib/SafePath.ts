const safePathPattern = /^\/(?![/\\])(?!.*\/\/)(?!.*%(?:2f|5c))[A-Za-z0-9\-._~!$&'()*+,;=:@%/]{0,511}$/iu;

export function isSafePath(value: unknown): value is string {
    return typeof value === "string" && safePathPattern.test(value);
}

export function safePathOr(value: unknown, fallback = "/"): string {
    return isSafePath(value) ? value : fallback;
}
