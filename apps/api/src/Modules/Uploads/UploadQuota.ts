import { ApplicationError, ErrorCode } from "../../Common/Errors/ApplicationError.js";
import type { KeyValueStore } from "../../Infrastructure/Cache/KeyValueStore.js";

export enum UploadQuota {
    Media = "media",
    Deliverable = "deliverable"
}

const hourlyLimits: Readonly<Record<UploadQuota, number>> = {
    [UploadQuota.Media]: 20,
    [UploadQuota.Deliverable]: 20
};

const windowSeconds = 60 * 60;

export async function consumeUploadQuota(store: KeyValueStore, quota: UploadQuota, userId: string): Promise<void> {
    const used = await store.incrementWithin(`upload-quota:${quota}:${userId}`, windowSeconds);
    if (used > hourlyLimits[quota]) {
        throw new ApplicationError(429, ErrorCode.TooManyRequests, "Upload quota exceeded. Try again later.", [], {
            "Retry-After": String(windowSeconds)
        });
    }
}
