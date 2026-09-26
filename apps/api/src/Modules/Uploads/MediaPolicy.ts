import { MediaContentType } from "@platform/contracts";
import { randomUUID } from "node:crypto";
import { ErrorCode, UnprocessableError } from "../../Common/Errors/ApplicationError.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";

const extensions: Readonly<Record<MediaContentType, string>> = {
    [MediaContentType.Png]: "png",
    [MediaContentType.Jpeg]: "jpg",
    [MediaContentType.Gif]: "gif",
    [MediaContentType.Webp]: "webp",
    [MediaContentType.Mp4]: "mp4",
    [MediaContentType.Webm]: "webm",
    [MediaContentType.QuickTime]: "mov"
};

const mediaKeyPattern = /^media\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(?:png|jpg|gif|webp|mp4|webm|mov)$/u;

export function createMediaKey(ownerId: string, contentType: MediaContentType): string {
    return `media/${ownerId}/${randomUUID()}.${extensions[contentType]}`;
}

export async function assertUploadedMedia(storage: ObjectStorage, key: string, ownerId: string | null, maxBytes: number): Promise<void> {
    const match = mediaKeyPattern.exec(key);
    if (match === null || (ownerId !== null && match[1] !== ownerId)) {
        throw new UnprocessableError("mediaKey does not reference one of your uploads.", ErrorCode.UploadMissing, [
            { path: "body.mediaKey", message: "invalid upload key" }
        ]);
    }
    const metadata = await storage.getMetadata(StorageBucket.Media, key);
    const allowedTypes: readonly string[] = Object.values(MediaContentType);
    if (
        metadata === null ||
        metadata.sizeBytes <= 0 ||
        metadata.sizeBytes > maxBytes ||
        !allowedTypes.includes(metadata.contentType ?? "")
    ) {
        throw new UnprocessableError("The referenced upload is missing or invalid.", ErrorCode.UploadMissing, [
            { path: "body.mediaKey", message: "upload not found" }
        ]);
    }
}

export { MediaContentType };
