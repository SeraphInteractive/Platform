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
};
