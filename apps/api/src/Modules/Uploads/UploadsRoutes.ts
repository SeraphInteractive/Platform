import { presignedUploadSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { currentUser, requireUser } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { ServiceUnavailableError } from "../../Common/Errors/ApplicationError.js";
import { StorageBucket, type PresignedUpload } from "../../Infrastructure/Storage/ObjectStorage.js";
import { createMediaKey, MediaContentType } from "./MediaPolicy.js";
import { consumeUploadQuota, UploadQuota } from "./UploadQuota.js";

export function toPresignedUploadResponse(upload: PresignedUpload): z.infer<typeof presignedUploadSchema> {
    return {
        key: upload.key,
        method: upload.method,
        url: upload.url,
        headers: { ...upload.headers },
        expiresAt: upload.expiresAt.toISOString()
    };
}

export const uploadsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { objectStorage, configuration } = services;

    application.post(
        "/uploads/media",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
            schema: {
                tags: ["Uploads"],
                summary: "Request a pre-signed URL for uploading entry media (images or short videos).",
                security: [{ bearer: [] }],
                body: z.object({
                    contentType: z.enum(MediaContentType),
                    sizeBytes: z.number().int().min(1).max(configuration.storage.mediaMaxBytes)
                }),
                response: { 201: dataEnvelope(presignedUploadSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            if (!objectStorage.isEnabled(StorageBucket.Media)) {
                throw new ServiceUnavailableError("Media uploads are not configured on this server.");
            }
            const user = currentUser(request);
            await consumeUploadQuota(services.keyValueStore, UploadQuota.Media, user.id);
            const key = createMediaKey(user.id, request.body.contentType);
            const upload = await objectStorage.createUpload(StorageBucket.Media, key, request.body.contentType, request.body.sizeBytes);
            return reply.status(201).send({ data: toPresignedUploadResponse(upload) });
        }
    );

    application.put(
        "/uploads/media/file/*",
        {
            config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
        },
        async (request, reply) => {
            const rawKey = decodeURIComponent((request.params as { "*": string })["*"] || "");
            const buffer = request.body as Buffer;
            if (!buffer || buffer.length === 0) {
                return reply.status(400).send({ message: "Missing file payload" });
            }
            if ("saveMedia" in objectStorage && typeof (objectStorage as { saveMedia: unknown }).saveMedia === "function") {
                (objectStorage as { saveMedia: (k: string, b: Buffer) => void }).saveMedia(rawKey, buffer);
            }
            return reply.status(200).send({ status: "ok", key: rawKey });
        }
    );

    application.get(
        "/uploads/media/file/*",
        async (request, reply) => {
            const rawKey = decodeURIComponent((request.params as { "*": string })["*"] || "");
            if ("readMedia" in objectStorage && typeof (objectStorage as { readMedia: unknown }).readMedia === "function") {
                const item = (objectStorage as { readMedia: (k: string) => { buffer: Buffer; contentType: string } | null }).readMedia(rawKey);
                if (item === null) {
                    return reply.status(404).send({ message: "Media file not found" });
                }
                void reply.header("Content-Type", item.contentType);
                void reply.header("Cache-Control", "public, max-age=31536000, immutable");
                return reply.send(item.buffer);
            }
            return reply.status(404).send({ message: "Media storage unavailable" });
        }
    );
};
