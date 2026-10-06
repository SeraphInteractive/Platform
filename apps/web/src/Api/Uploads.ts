import type { PresignedUploadDto } from "@platform/contracts";
import { ApiError } from "./ApiClient";

const browserManagedHeaders = new Set(["content-length", "host", "connection"]);

export type UploadProgressHandler = (fraction: number) => void;

async function uploadDirect(
    upload: PresignedUploadDto,
    file: Blob,
    onProgress?: UploadProgressHandler,
    signal?: AbortSignal
): Promise<void> {
    const target = new URL(upload.url);
    if (target.protocol !== "https:" && target.protocol !== window.location.protocol) {
        throw new ApiError(0, "INSECURE_UPLOAD", "Refusing to upload over an insecure connection.");
    }

    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(upload.method, target.toString());
        for (const [name, value] of Object.entries(upload.headers)) {
            if (!browserManagedHeaders.has(name.toLowerCase())) {
                xhr.setRequestHeader(name, value);
            }
        }
        xhr.upload.onprogress = (event: ProgressEvent): void => {
            if (event.lengthComputable && onProgress !== undefined) {
                onProgress(event.loaded / event.total);
            }
        };
        xhr.onload = (): void => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(1);
                resolve();
            } else {
                reject(new ApiError(xhr.status, "UPLOAD_FAILED", "Storage rejected the upload. Try again."));
            }
        };
        xhr.onerror = (): void => {
            reject(new ApiError(0, "UPLOAD_FAILED", "Direct storage upload failed."));
        };
        xhr.onabort = (): void => {
            reject(new DOMException("Upload cancelled.", "AbortError"));
        };
        if (signal !== undefined) {
            if (signal.aborted) {
                reject(new DOMException("Upload cancelled.", "AbortError"));
                return;
            }
            signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.send(file);
    });
}

async function uploadViaBackendStream(key: string, file: Blob, onProgress?: UploadProgressHandler, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/v1/uploads/stream?key=${encodeURIComponent(key)}`);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (event: ProgressEvent): void => {
            if (event.lengthComputable && onProgress !== undefined) {
                onProgress(event.loaded / event.total);
            }
        };
        xhr.onload = (): void => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(1);
                resolve();
            } else {
                reject(new ApiError(xhr.status, "STREAM_UPLOAD_FAILED", "Backend upload stream rejected the file."));
            }
        };
        xhr.onerror = (): void => {
            reject(new ApiError(0, "STREAM_UPLOAD_FAILED", "Backend upload failed. Check your connection."));
        };
        xhr.onabort = (): void => {
            reject(new DOMException("Upload cancelled.", "AbortError"));
        };
        if (signal !== undefined) {
            if (signal.aborted) {
                reject(new DOMException("Upload cancelled.", "AbortError"));
                return;
            }
            signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.send(file);
    });
}

export async function uploadToStorage(
    upload: PresignedUploadDto,
    file: Blob,
    onProgress?: UploadProgressHandler,
    signal?: AbortSignal
): Promise<void> {
    try {
        await uploadDirect(upload, file, onProgress, signal);
    } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
        }
        // fallback to server proxy streaming if direct r2 presigned put failed (e.g. cors restriction)
        await uploadViaBackendStream(upload.key, file, onProgress, signal);
    }
}
