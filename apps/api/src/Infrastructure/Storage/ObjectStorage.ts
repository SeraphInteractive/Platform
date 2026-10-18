export enum StorageBucket {
    Deliverables = "deliverables",
    Media = "media"
}

export interface PresignedUpload {
    readonly method: "PUT";
    readonly url: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly key: string;
    readonly expiresAt: Date;
}

export interface StoredObjectMetadata {
    readonly sizeBytes: number;
    readonly contentType: string | undefined;
}

export interface StorageUsage {
    readonly usedBytes: number;
    readonly availableBytes: number | null;
}

export interface ObjectStorage {
    isEnabled(bucket: StorageBucket): boolean;
    createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload>;
    getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null>;
    getObject(bucket: StorageBucket, key: string, maxBytes?: number): Promise<Buffer | null>;
    putObject(bucket: StorageBucket, key: string, data: Buffer, contentType: string): Promise<void>;
    createDownloadUrl(bucket: StorageBucket, key: string): Promise<string>;
    getPublicUrl(bucket: StorageBucket, key: string): string | null;
    deleteObject(bucket: StorageBucket, key: string): Promise<void>;
    moveObject?(bucket: StorageBucket, sourceKey: string, destinationKey: string): Promise<void>;
    getStorageUsage?(bucket?: StorageBucket): Promise<StorageUsage | null>;
    getVaultFolderUrl?(bucket: StorageBucket, folderPath: string): string | null;
}
