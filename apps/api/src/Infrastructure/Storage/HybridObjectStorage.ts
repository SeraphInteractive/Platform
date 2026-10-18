import { StorageBucket, type ObjectStorage, type PresignedUpload, type StorageUsage, type StoredObjectMetadata } from "./ObjectStorage.js";

export class HybridObjectStorage implements ObjectStorage {
    public constructor(
        private readonly deliverablesStorage: ObjectStorage,
        private readonly mediaStorage: ObjectStorage
    ) {}

    public isEnabled(bucket: StorageBucket): boolean {
        return this.resolve(bucket).isEnabled(bucket);
    }

    public async createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
        return this.resolve(bucket).createUpload(bucket, key, contentType, sizeBytes);
    }

    public async getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        return this.resolve(bucket).getMetadata(bucket, key);
    }

    public async getObject(bucket: StorageBucket, key: string, maxBytes?: number): Promise<Buffer | null> {
        return this.resolve(bucket).getObject(bucket, key, maxBytes);
    }

    public async putObject(bucket: StorageBucket, key: string, data: Buffer, contentType: string): Promise<void> {
        return this.resolve(bucket).putObject(bucket, key, data, contentType);
    }

    public async createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        return this.resolve(bucket).createDownloadUrl(bucket, key);
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        return this.resolve(bucket).getPublicUrl(bucket, key);
    }

    public async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
        return this.resolve(bucket).deleteObject(bucket, key);
    }

    public async moveObject(bucket: StorageBucket, sourceKey: string, destinationKey: string): Promise<void> {
        const storage = this.resolve(bucket);
        if (typeof storage.moveObject === "function") {
            await storage.moveObject(bucket, sourceKey, destinationKey);
            return;
        }

        // fallback to copy-delete when driver lacks native move
        const data = await storage.getObject(bucket, sourceKey);
        if (data === null) {
            return;
        }
        const meta = await storage.getMetadata(bucket, sourceKey);
        await storage.putObject(bucket, destinationKey, data, meta?.contentType ?? "application/octet-stream");
        await storage.deleteObject(bucket, sourceKey);
    }

    public async getStorageUsage(bucket?: StorageBucket): Promise<StorageUsage | null> {
        const target = bucket ? this.resolve(bucket) : this.deliverablesStorage;
        if (typeof target.getStorageUsage === "function") {
            return target.getStorageUsage(bucket);
        }
        return null;
    }

    public getVaultFolderUrl(bucket: StorageBucket, folderPath: string): string | null {
        const storage = this.resolve(bucket);
        if (typeof storage.getVaultFolderUrl === "function") {
            return storage.getVaultFolderUrl(bucket, folderPath);
        }
        return null;
    }

    private resolve(bucket: StorageBucket): ObjectStorage {
        if (bucket === StorageBucket.Media) {
            return this.mediaStorage;
        }
        return this.deliverablesStorage;
    }
}
