import { ServiceUnavailableError } from "../../Common/Errors/ApplicationError.js";
import { StorageBucket, type ObjectStorage, type PresignedUpload, type StorageUsage, type StoredObjectMetadata } from "./ObjectStorage.js";

const uploadUrlTtlSeconds = 15 * 60;

export interface NextcloudStorageConfiguration {
    readonly url: string;
    readonly username: string;
    readonly password?: string;
    readonly basePath?: string;
    readonly publicUrl?: string;
}

export class NextcloudWebDAVStorage implements ObjectStorage {
    private readonly internalBaseUrl: string;
    private readonly publicBaseUrl: string;
    private readonly webUrl: string;
    private readonly authHeader: string;
    private readonly enabled: boolean;

    public constructor(config: Partial<NextcloudStorageConfiguration>) {
        if (!config.url || !config.username) {
            this.enabled = false;
            this.internalBaseUrl = "";
            this.publicBaseUrl = "";
            this.webUrl = "";
            this.authHeader = "";
            return;
        }

        this.enabled = true;
        const basePath = config.basePath ?? "/remote.php/dav/files";
        const normalizedInternal = config.url.replace(/\/+$/u, "");
        const normalizedPublic = (config.publicUrl ?? config.url).replace(/\/+$/u, "");

        this.internalBaseUrl = `${normalizedInternal}${basePath}/${encodeURIComponent(config.username)}`;
        this.publicBaseUrl = `${normalizedPublic}${basePath}/${encodeURIComponent(config.username)}`;
        this.webUrl = normalizedPublic;
        const credentials = `${config.username}:${config.password ?? ""}`;
        this.authHeader = `Basic ${Buffer.from(credentials).toString("base64")}`;
    }

    public isEnabled(bucket: StorageBucket): boolean {
        return this.enabled && bucket === StorageBucket.Deliverables;
    }

    public async createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
        this.assertBucket(bucket);
        const cleanKey = key.replace(/^\/+/u, "");
        // webdav put requires parent collections to exist upfront
        await this.ensureParentDirectories(cleanKey);

        const uploadUrl = `${this.publicBaseUrl}/${this.encodeKeyPath(cleanKey)}`;
        return {
            method: "PUT",
            url: uploadUrl,
            headers: {
                Authorization: this.authHeader,
                "Content-Type": contentType,
                "Content-Length": String(sizeBytes)
            },
            key: cleanKey,
            expiresAt: new Date(Date.now() + uploadUrlTtlSeconds * 1000)
        };
    }

    public async getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        this.assertBucket(bucket);
        const url = `${this.internalBaseUrl}/${this.encodeKeyPath(key)}`;
        const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getcontentlength/>
    <d:getcontenttype/>
  </d:prop>
</d:propfind>`;

        const response = await fetch(url, {
            method: "PROPFIND",
            headers: {
                Authorization: this.authHeader,
                Depth: "0",
                "Content-Type": "application/xml"
            },
            body
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok && response.status !== 207) {
            throw new Error(`WebDAV PROPFIND failed: HTTP ${response.status}`);
        }

        const text = await response.text();
        const lengthMatch = /<(?:d:)?getcontentlength>(\d+)<\/(?:d:)?getcontentlength>/iu.exec(text);
        const typeMatch = /<(?:d:)?getcontenttype>([^<]+)<\/(?:d:)?getcontenttype>/iu.exec(text);

        return {
            sizeBytes: lengthMatch ? parseInt(lengthMatch[1]!, 10) : 0,
            contentType: typeMatch ? typeMatch[1]!.trim() : undefined
        };
    }

    public async getObject(bucket: StorageBucket, key: string, maxBytes?: number): Promise<Buffer | null> {
        this.assertBucket(bucket);
        const url = `${this.internalBaseUrl}/${this.encodeKeyPath(key)}`;
        const headers: Record<string, string> = {
            Authorization: this.authHeader
        };

        if (maxBytes !== undefined && maxBytes > 0) {
            headers.Range = `bytes=0-${maxBytes - 1}`;
        }

        const response = await fetch(url, {
            method: "GET",
            headers
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok && response.status !== 206) {
            throw new Error(`WebDAV GET failed: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    public async putObject(bucket: StorageBucket, key: string, data: Buffer, contentType: string): Promise<void> {
        this.assertBucket(bucket);
        const cleanKey = key.replace(/^\/+/u, "");
        await this.ensureParentDirectories(cleanKey);

        const url = `${this.internalBaseUrl}/${this.encodeKeyPath(cleanKey)}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: this.authHeader,
                "Content-Type": contentType,
                "Content-Length": String(data.length)
            },
            body: data
        });

        if (!response.ok && response.status !== 201 && response.status !== 204) {
            throw new Error(`WebDAV PUT failed: HTTP ${response.status}`);
        }
    }

    public async createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        this.assertBucket(bucket);
        return `${this.publicBaseUrl}/${this.encodeKeyPath(key)}`;
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        if (!this.isEnabled(bucket)) {
            return null;
        }
        return `${this.publicBaseUrl}/${this.encodeKeyPath(key)}`;
    }

    public async deleteObject(bucket: StorageBucket, key: string): Promise<void> {
        this.assertBucket(bucket);
        const url = `${this.internalBaseUrl}/${this.encodeKeyPath(key)}`;
        const response = await fetch(url, {
            method: "DELETE",
            headers: {
                Authorization: this.authHeader
            }
        });

        if (!response.ok && response.status !== 404) {
            throw new Error(`WebDAV DELETE failed: HTTP ${response.status}`);
        }
    }

    public async moveObject(bucket: StorageBucket, sourceKey: string, destinationKey: string): Promise<void> {
        this.assertBucket(bucket);
        const cleanSource = sourceKey.replace(/^\/+/u, "");
        const cleanDest = destinationKey.replace(/^\/+/u, "");

        await this.ensureParentDirectories(cleanDest);

        const sourceUrl = `${this.internalBaseUrl}/${this.encodeKeyPath(cleanSource)}`;
        const destUrl = `${this.internalBaseUrl}/${this.encodeKeyPath(cleanDest)}`;

        const response = await fetch(sourceUrl, {
            method: "MOVE",
            headers: {
                Authorization: this.authHeader,
                Destination: destUrl,
                Overwrite: "T"
            }
        });

        if (!response.ok && response.status !== 201 && response.status !== 204) {
            throw new Error(`WebDAV MOVE failed: HTTP ${response.status}`);
        }
    }

    public async getStorageUsage(): Promise<StorageUsage | null> {
        if (!this.enabled) {
            return null;
        }

        const url = `${this.internalBaseUrl}/`;
        const body = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:quota-used-bytes/>
    <d:quota-available-bytes/>
  </d:prop>
</d:propfind>`;

        const response = await fetch(url, {
            method: "PROPFIND",
            headers: {
                Authorization: this.authHeader,
                Depth: "0",
                "Content-Type": "application/xml"
            },
            body
        });

        if (!response.ok && response.status !== 207) {
            return null;
        }

        const text = await response.text();
        const usedMatch = /<(?:d:)?quota-used-bytes>(\d+)<\/(?:d:)?quota-used-bytes>/iu.exec(text);
        const availMatch = /<(?:d:)?quota-available-bytes>(-?\d+)<\/(?:d:)?quota-available-bytes>/iu.exec(text);

        if (!usedMatch) {
            return null;
        }

        const usedBytes = parseInt(usedMatch[1]!, 10);
        const rawAvail = availMatch ? parseInt(availMatch[1]!, 10) : -1;
        const availableBytes = rawAvail >= 0 ? rawAvail : null;

        return { usedBytes, availableBytes };
    }

    public getVaultFolderUrl(bucket: StorageBucket, folderPath: string): string | null {
        if (!this.isEnabled(bucket) || !this.webUrl) {
            return null;
        }
        const clean = folderPath.replace(/^\/+/u, "").replace(/\/+$/u, "");
        const encoded = this.encodeKeyPath(clean);
        return `${this.webUrl}/apps/files/folders?dir=/${encoded}`;
    }

    private async ensureParentDirectories(key: string): Promise<void> {
        const segments = key.split("/").filter(Boolean);
        if (segments.length <= 1) {
            return;
        }

        const dirs = segments.slice(0, -1);
        let currentPath = "";

        for (const dir of dirs) {
            currentPath = currentPath ? `${currentPath}/${dir}` : dir;
            const dirUrl = `${this.internalBaseUrl}/${this.encodeKeyPath(currentPath)}`;

            const response = await fetch(dirUrl, {
                method: "MKCOL",
                headers: {
                    Authorization: this.authHeader
                }
            });

            // mkcol returns 405 if collection already exists
            if (!response.ok && response.status !== 201 && response.status !== 405) {
                const checkResponse = await fetch(dirUrl, {
                    method: "PROPFIND",
                    headers: {
                        Authorization: this.authHeader,
                        Depth: "0"
                    }
                });
                if (!checkResponse.ok && checkResponse.status !== 207) {
                    throw new Error(`Failed to create directory ${currentPath}: HTTP ${response.status}`);
                }
            }
        }
    }

    private encodeKeyPath(key: string): string {
        return key
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
    }

    private assertBucket(bucket: StorageBucket): void {
        if (!this.isEnabled(bucket)) {
            throw new ServiceUnavailableError(`Nextcloud storage is not enabled for bucket: ${bucket}`);
        }
    }
}
