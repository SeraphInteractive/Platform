import { deliverableContentTypes } from "@platform/contracts";
import { randomUUID } from "node:crypto";
import { ErrorCode, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { DeliverableKind, DifficultyTier } from "../../Domain/Enums.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import { matchesDeliverableKind } from "../Uploads/MagicBytes.js";

const deliverableExtensions: Readonly<Record<DeliverableKind, readonly string[]>> = {
    [DeliverableKind.Video]: [".mp4", ".webm", ".mov"],
    [DeliverableKind.Blend]: [".blend"]
};

const tierDurationDays: Readonly<Record<DifficultyTier, number>> = {
    [DifficultyTier.Easy]: 5,
    [DifficultyTier.Medium]: 7,
    [DifficultyTier.Hard]: 10,
    [DifficultyTier.Complex]: 14
};

export const seniorPriorityTiers: ReadonlySet<DifficultyTier> = new Set([DifficultyTier.Hard, DifficultyTier.Complex]);

export function tierDaysOf(tier: DifficultyTier): number {
    return tierDurationDays[tier];
}

export function sanitizeFileName(fileName: string, kind: DeliverableKind): string {
    const base = fileName.split(/[/\\]/u).pop() ?? "";
    const cleaned = base
        .replace(/[^A-Za-z0-9._-]/gu, "_")
        .replace(/^\.+/u, "")
        .slice(-100);
    const lower = cleaned.toLowerCase();
    if (cleaned.length === 0 || !deliverableExtensions[kind].some((extension) => lower.endsWith(extension))) {
        throw new UnprocessableError(`fileName must end with ${deliverableExtensions[kind].join(", ")}.`, ErrorCode.ValidationFailed, [
            { path: "body.fileName", message: "unsupported file extension" }
        ]);
    }
    return cleaned;
}

export function deliverablePrefix(shotId: string, userId: string): string {
    return `shots/${shotId}/${userId}/`;
}

export function createDeliverableKey(shotId: string, userId: string, fileName: string): string {
    return `${deliverablePrefix(shotId, userId)}${randomUUID()}-${fileName}`;
}

export async function assertDeliverable(
    storage: ObjectStorage,
    key: string,
    kind: DeliverableKind,
    shotId: string,
    userId: string,
    maxBytes: number,
    field: string
): Promise<void> {
    const prefix = deliverablePrefix(shotId, userId);
    const remainder = key.startsWith(prefix) ? key.slice(prefix.length) : "";
    const isWellFormed = /^[0-9a-f-]{36}-[A-Za-z0-9._-]{1,100}$/u.test(remainder) && !remainder.includes("..");
    const metadata = isWellFormed ? await storage.getMetadata(StorageBucket.Deliverables, key) : null;
    if (
        metadata === null ||
        metadata.sizeBytes <= 0 ||
        metadata.sizeBytes > maxBytes ||
        !deliverableContentTypes[kind].includes(metadata.contentType ?? "")
    ) {
        throw new UnprocessableError(`${field} does not reference a completed upload for this shot.`, ErrorCode.UploadMissing, [
            { path: `body.${field}`, message: "upload not found" }
        ]);
    }

    const header = await storage.getObject(StorageBucket.Deliverables, key, 512);
    if (!matchesDeliverableKind(header, kind)) {
        throw new UnprocessableError(`${field} does not match the required ${kind} format.`, ErrorCode.UploadMissing, [
            { path: `body.${field}`, message: "invalid file signature" }
        ]);
    }
}

export { deliverableContentTypes };
