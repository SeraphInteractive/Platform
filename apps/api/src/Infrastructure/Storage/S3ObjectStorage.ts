import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { ServiceUnavailableError } from "../../Common/Errors/ApplicationError.js";
import { StorageBucket, type ObjectStorage, type PresignedUpload, type StoredObjectMetadata } from "./ObjectStorage.js";

const uploadUrlTtlSeconds = 15 * 60;
const downloadUrlTtlSeconds = 60 * 60;

export class S3ObjectStorage implements ObjectStorage {
    private readonly client: S3Client | null;
    private readonly buckets: ReadonlyMap<StorageBucket, string>;

    public constructor(private readonly configuration: StorageConfiguration) {
        const buckets = new Map<StorageBucket, string>();
        if (configuration.deliverablesBucket !== undefined) {
            buckets.set(StorageBucket.Deliverables, configuration.deliverablesBucket);
        }
        if (configuration.mediaBucket !== undefined && configuration.mediaPublicUrl !== undefined) {
            buckets.set(StorageBucket.Media, configuration.mediaBucket);
        }
        this.buckets = buckets;
        this.client =
            configuration.accessKeyId !== undefined && configuration.secretAccessKey !== undefined && buckets.size > 0
                ? new S3Client({
                      region: configuration.region,
                      endpoint: configuration.endpoint,
                      forcePathStyle: configuration.endpoint !== undefined,
                      credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey }
                  })
                : null;
    }

    public isEnabled(bucket: StorageBucket): boolean {
        return this.client !== null && this.buckets.has(bucket);
    }

    public async createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
        const { client, name } = this.resolve(bucket);
        const command = new PutObjectCommand({ Bucket: name, Key: key, ContentType: contentType, ContentLength: sizeBytes });
        const url = await getSignedUrl(client, command, {
            expiresIn: uploadUrlTtlSeconds,
            signableHeaders: new Set(["content-type", "content-length"])
        });
        return {
            method: "PUT",
            url,
            headers: { "Content-Type": contentType, "Content-Length": String(sizeBytes) },
            key,
            expiresAt: new Date(Date.now() + uploadUrlTtlSeconds * 1000)
        };
    }

    public async getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        const { client, name } = this.resolve(bucket);
        try {
            const result = await client.send(new HeadObjectCommand({ Bucket: name, Key: key }));
            return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
        } catch (error: unknown) {
            if (error instanceof NotFound || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) {
                return null;
            }
            throw error;
        }
    }

    public async createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        const { client, name } = this.resolve(bucket);
        const fileName = key.slice(key.lastIndexOf("/") + 1);
        const command = new GetObjectCommand({
            Bucket: name,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${fileName}"`
        });
        return getSignedUrl(client, command, { expiresIn: downloadUrlTtlSeconds });
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        if (bucket !== StorageBucket.Media || this.configuration.mediaPublicUrl === undefined) {
            return null;
        }
        const base = this.configuration.mediaPublicUrl.replace(/\/+$/u, "");
        return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
    }

    public async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
        if (!this.isEnabled(bucket)) {
            return;
        }
        const { client, name } = this.resolve(bucket);
        try {
            await client.send(new DeleteObjectCommand({ Bucket: name, Key: key }));
        } catch (error: unknown) {
            if (error instanceof NotFound || (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)) {
                return;
            }
            throw error;
        }
    }

    private resolve(bucket: StorageBucket): { client: S3Client; name: string } {
        const name = this.buckets.get(bucket);
        if (this.client === null || name === undefined) {
            throw new ServiceUnavailableError("File storage is not configured on this server.");
        }
        return { client: this.client, name };
    }
}
