import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateSecret(prefix: string, byteLength = 32): string {
    return `${prefix}${randomBytes(byteLength).toString("base64url")}`;
}

export function sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hmacHex(key: string, value: string, length = 64): string {
    return createHmac("sha256", key).update(value, "utf8").digest("hex").slice(0, length);
}

export function constantTimeEquals(left: string, right: string): boolean {
    const leftDigest = createHash("sha256").update(left, "utf8").digest();
    const rightDigest = createHash("sha256").update(right, "utf8").digest();
    return timingSafeEqual(leftDigest, rightDigest);
}
