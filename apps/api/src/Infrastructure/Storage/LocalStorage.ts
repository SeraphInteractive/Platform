import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import type { StorageConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { StorageBucket, type ObjectStorage, type PresignedUpload, type StoredObjectMetadata } from "./ObjectStorage.js";
import { S3ObjectStorage } from "./S3ObjectStorage.js";

const extensionMimeTypes: Readonly<Record<string, string>> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime"
};

export class LocalMediaStorage implements ObjectStorage {
    private readonly s3Storage: S3ObjectStorage;
    private readonly localDir: string;
    private readonly baseUrl: string;

    public constructor(
        private readonly configuration: StorageConfiguration,
        appUrl = ""
    ) {
        this.s3Storage = new S3ObjectStorage(configuration);
        this.localDir = resolve(process.cwd(), "storage", "media");
        if (!existsSync(this.localDir)) {
            mkdirSync(this.localDir, { recursive: true });
        }
        this.baseUrl = (configuration.mediaPublicUrl || appUrl).replace(/\/+$/u, "");
    }

    public isEnabled(bucket: StorageBucket): boolean {
        if (bucket === StorageBucket.Media) {
            return true;
        }
        return this.s3Storage.isEnabled(bucket);
    }

    public async createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
        if (bucket === StorageBucket.Media) {
            const uploadUrl = `${this.baseUrl}/api/v1/uploads/media/file/${encodeURIComponent(key)}`;
            return {
                method: "PUT",
                url: uploadUrl,
                headers: { "Content-Type": contentType, "Content-Length": String(sizeBytes) },
                key,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            };
        }
        return this.s3Storage.createUpload(bucket, key, contentType, sizeBytes);
    }

    public async getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        if (bucket === StorageBucket.Media) {
            const target = this.resolvePath(key);
            if (target === null || !existsSync(target)) {
                return null;
            }
            try {
                const stat = statSync(target);
                const ext = extname(target).toLowerCase();
                return {
                    sizeBytes: stat.size,
                    contentType: extensionMimeTypes[ext] || "application/octet-stream"
                };
            } catch {
                return null;
            }
        }
        return this.s3Storage.getMetadata(bucket, key);
    }

    public async createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        if (bucket === StorageBucket.Media) {
            return `${this.baseUrl}/api/v1/uploads/media/file/${encodeURIComponent(key)}`;
        }
        return this.s3Storage.createDownloadUrl(bucket, key);
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        if (bucket === StorageBucket.Media) {
            return `${this.baseUrl}/api/v1/uploads/media/file/${encodeURIComponent(key)}`;
        }
        return this.s3Storage.getPublicUrl(bucket, key);
    }

    public saveMedia(key: string, buffer: Buffer): void {
        const target = this.resolvePath(key);
        if (target === null) {
            throw new Error("Invalid media storage path");
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, buffer);
    }

    public readMedia(key: string): { buffer: Buffer; contentType: string } | null {
        const target = this.resolvePath(key);
        if (target === null || !existsSync(target)) {
            return null;
        }
        const ext = extname(target).toLowerCase();
        return {
            buffer: readFileSync(target),
            contentType: extensionMimeTypes[ext] || "application/octet-stream"
        };
    }

    public resolvePath(key: string): string | null {
        const sanitized = key.replace(/\\/gu, "/");
        if (sanitized.includes("..")) {
            return null;
        }
        return resolve(this.localDir, sanitized);
    }
}
