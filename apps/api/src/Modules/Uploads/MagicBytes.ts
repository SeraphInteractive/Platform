function hasPrefix(buffer: Buffer, bytes: readonly number[]): boolean {
    if (buffer.length < bytes.length) {
        return false;
    }
    return bytes.every((byte, index) => buffer[index] === byte);
}

function isPng(buffer: Buffer): boolean {
    return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isJpeg(buffer: Buffer): boolean {
    return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
}

function isGif(buffer: Buffer): boolean {
    if (buffer.length < 6) {
        return false;
    }
    const sig = buffer.toString("ascii", 0, 6);
    return sig === "GIF87a" || sig === "GIF89a";
}

function isWebp(buffer: Buffer): boolean {
    if (buffer.length < 12) {
        return false;
    }
    return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

function isWebm(buffer: Buffer): boolean {
    return hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
}

function isIsoBmff(buffer: Buffer): boolean {
    if (buffer.length < 8) {
        return false;
    }
    // standard mp4/mov starts with 4-byte box size then 'ftyp'
    return buffer.toString("ascii", 4, 8) === "ftyp";
}

function isQuickTime(buffer: Buffer): boolean {
    if (isIsoBmff(buffer)) {
        return true;
    }
    if (buffer.length < 8) {
        return false;
    }
    // legacy quicktime atoms
    const tag = buffer.toString("ascii", 4, 8);
    return tag === "moov" || tag === "wide" || tag === "mdat" || tag === "free";
}

function isBlender(buffer: Buffer): boolean {
    if (buffer.length < 7) {
        return false;
    }
    return buffer.toString("ascii", 0, 7) === "BLENDER";
}

export function matchesContentType(buffer: Buffer | null, contentType: string): boolean {
    if (buffer === null || buffer.length === 0) {
        return false;
    }

    switch (contentType) {
        case "image/png":
            return isPng(buffer);
        case "image/jpeg":
            return isJpeg(buffer);
        case "image/gif":
            return isGif(buffer);
        case "image/webp":
            return isWebp(buffer);
        case "video/webm":
            return isWebm(buffer);
        case "video/mp4":
            return isIsoBmff(buffer);
        case "video/quicktime":
            return isQuickTime(buffer);
        default:
            return false;
    }
}

export function matchesDeliverableKind(buffer: Buffer | null, kind: "video" | "blend"): boolean {
    if (buffer === null || buffer.length === 0) {
        return false;
    }
    if (kind === "video") {
        return isIsoBmff(buffer) || isWebm(buffer) || isQuickTime(buffer);
    }
    if (kind === "blend") {
        return isBlender(buffer);
    }
    return false;
}
