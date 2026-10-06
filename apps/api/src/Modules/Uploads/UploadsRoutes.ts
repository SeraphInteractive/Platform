import { presignedUploadSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses } from "../../Common/Http/Schemas.js";
import { currentUser, requireUser } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import {
    BadRequestError,
    ForbiddenError,
    PayloadTooLargeError,
    ServiceUnavailableError,
    ErrorCode
} from "../../Common/Errors/ApplicationError.js";
import { StorageBucket, type PresignedUpload } from "../../Infrastructure/Storage/ObjectStorage.js";
import { createMediaKey, MediaContentType } from "./MediaPolicy.js";
import { consumeUploadQuota, UploadQuota } from "./UploadQuota.js";
import { matchesContentType, matchesDeliverableKind } from "./MagicBytes.js";

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

    application.post(
        "/uploads/stream",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
            schema: {
                tags: ["Uploads"],
                summary: "Stream an upload directly to storage as a fallback for CORS restrictions.",
                security: [{ bearer: [] }],
                querystring: z.object({
                    key: z.string().min(1).max(512)
                }),
                response: { 200: dataEnvelope(z.object({ key: z.string(), success: z.boolean() })), ...errorResponses }
            }
        },
        async (request, reply) => {
            const user = currentUser(request);
            const { key } = request.query;
            const contentType = (request.headers["content-type"] ?? "application/octet-stream").split(";")[0]!.trim();
            const buffer = request.body as Buffer;

            if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                throw new BadRequestError("Upload payload is empty.", ErrorCode.ValidationFailed);
            }

            let bucket: StorageBucket;
            if (key.startsWith(`media/${user.id}/`)) {
                bucket = StorageBucket.Media;
                if (!objectStorage.isEnabled(bucket)) {
                    throw new ServiceUnavailableError("Media storage is not configured.");
                }
                if (buffer.length > configuration.storage.mediaMaxBytes) {
                    throw new PayloadTooLargeError("The uploaded file exceeds the media size limit.");
                }
                if (!matchesContentType(buffer, contentType)) {
                    throw new BadRequestError("The uploaded file signature does not match its content type.", ErrorCode.ValidationFailed);
                }
            } else if (key.startsWith("shots/") && key.includes(`/${user.id}/`)) {
                bucket = StorageBucket.Deliverables;
                if (!objectStorage.isEnabled(bucket)) {
                    throw new ServiceUnavailableError("Deliverables storage is not configured.");
                }
                if (buffer.length > configuration.storage.deliverableMaxBytes) {
                    throw new PayloadTooLargeError("The uploaded file exceeds the deliverable size limit.");
                }
                const kind = key.endsWith(".blend") ? "blend" : "video";
                if (!matchesDeliverableKind(buffer, kind)) {
                    throw new BadRequestError(
                        `The uploaded file signature does not match required ${kind} format.`,
                        ErrorCode.ValidationFailed
                    );
                }
            } else {
                throw new ForbiddenError("You are not authorized to upload to this key destination.");
            }

            await objectStorage.putObject(bucket, key, buffer, contentType);
            return reply.status(200).send({ data: { key, success: true } });
        }
    );
};
