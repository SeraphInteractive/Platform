import { fieldRules, reviewQueueItemSchema, shotDetailSchema, shotSchema, submissionSchema } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, pageEnvelope, paginationQuerySchema, toIso, uuidSchema } from "../../Common/Http/Schemas.js";
import { currentUser, optionalUser, requireRole, requireUser, userActorOf } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { DeliverableKind, DifficultyTier, ReviewDecision, ShotStatus } from "../../Domain/Enums.js";
import { Role } from "../../Domain/Roles.js";
import type { ShotRecord, SubmissionRecord } from "../../Infrastructure/Database/Schema.js";
import { toUserSummary } from "../Users/UserPresenter.js";
import { toPresignedUploadResponse } from "../Uploads/UploadsRoutes.js";
import { presignedUploadSchema } from "@platform/contracts";
import { consumeUploadQuota, UploadQuota } from "../Uploads/UploadQuota.js";
import { deliverableContentTypes, tierDaysOf } from "./DeliverablePolicy.js";
import { StorageBucket, type ObjectStorage } from "../../Infrastructure/Storage/ObjectStorage.js";
import type { ShotListItem, SubmissionView } from "./ShotsService.js";
import type { ReviewQueueItem } from "./ReviewsService.js";

const shotParams = z.object({ shotId: uuidSchema });
const allDeliverableTypes = [...new Set(Object.values(deliverableContentTypes).flat())] as [string, ...string[]];

function toShotCore(
    shot: ShotRecord,
    storage: ObjectStorage
): Omit<z.infer<typeof shotSchema>, "claimer" | "latestSubmission" | "isSeniorLocked"> {
    return {
        id: shot.id,
        roundId: shot.roundId,
        sceneNumber: shot.sceneNumber,
        shotCode: shot.shotCode,
        title: shot.title,
        description: shot.description,
        difficultyTier: shot.difficultyTier,
        tierDays: tierDaysOf(shot.difficultyTier),
        status: shot.status,
        claimedAt: toIso(shot.claimedAt),
        deadlineAt: toIso(shot.deadlineAt),
        seniorPriorityUntil: toIso(shot.seniorPriorityUntil),
        imageUrls: (shot.imageKeys ?? [])
            .map((key) => storage.getPublicUrl(StorageBucket.Media, key))
            .filter((url): url is string => url !== null),
        createdAt: toIso(shot.createdAt),
        updatedAt: toIso(shot.updatedAt)
    };
}

function toShotResponse(item: ShotListItem, storage: ObjectStorage): z.infer<typeof shotSchema> {
    return {
        ...toShotCore(item.shot, storage),
        claimer: item.claimer === null ? null : toUserSummary(item.claimer),
        isSeniorLocked: item.isSeniorLocked,
        latestSubmission: item.latestSubmission
    };
}

function toSubmissionResponse(
    view: Omit<SubmissionView, "reviewer"> & Partial<Pick<SubmissionView, "reviewer">>
): z.infer<typeof submissionSchema> {
    const submission: SubmissionRecord = view.submission;
    return {
        id: submission.id,
        shotId: submission.shotId,
        version: submission.version,
        status: submission.status,
        notes: submission.notes,
        supervisorNotes: submission.supervisorNotes,
        contributor: view.contributor === null ? null : toUserSummary(view.contributor),
        reviewer: view.reviewer === undefined || view.reviewer === null ? null : toUserSummary(view.reviewer),
        reviewedAt: toIso(submission.reviewedAt),
        videoUrl: view.videoUrl,
        blendUrl: view.blendUrl,
        aiFlags: submission.aiFlags ?? [],
        createdAt: toIso(submission.createdAt)
    };
}

function toReviewQueueResponse(item: ReviewQueueItem, storage: ObjectStorage): z.infer<typeof reviewQueueItemSchema> {
    return { ...toSubmissionResponse({ ...item, reviewer: null }), shot: toShotCore(item.shot, storage) };
}

export const shotsRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { shotsService, reviewsService, objectStorage, configuration } = services;
    const security = [{ bearer: [] }];
    const supervisor = requireRole(Role.Supervisor);

    application.get(
        "/shots",
        {
            schema: {
                tags: ["Shots"],
                summary: "Browse the shot grab-box.",
                querystring: paginationQuerySchema.extend({
                    sceneNumber: z.coerce.number().int().positive().optional(),
                    difficultyTier: z.enum(DifficultyTier).optional(),
                    status: z.enum(ShotStatus).optional()
                }),
                response: { 200: pageEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request) => {
            const page = await shotsService.list(request.query, optionalUser(request));
            return { data: page.data.map((item) => toShotResponse(item, objectStorage)), meta: page.meta };
        }
    );

    application.get(
        "/shots/by-code/:shotCode",
        {
            schema: {
                tags: ["Shots"],
                summary: "Get a shot by code.",
                params: z.object({ shotCode: z.string().min(1).max(50) }),
                response: { 200: dataEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const item = await shotsService.getByCode(request.params.shotCode, optionalUser(request));
            void reply.header("Cache-Control", "private, no-store");
            return { data: toShotResponse(item, objectStorage) };
        }
    );

    application.get(
        "/shots/:shotId",
        {
            schema: {
                tags: ["Shots"],
                summary: "Get a shot with its submission history.",
                params: shotParams,
                response: { 200: dataEnvelope(shotDetailSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const detail = await shotsService.getDetail(request.params.shotId, optionalUser(request));
            void reply.header("Cache-Control", "private, no-store");
            return {
                data: {
                    ...toShotResponse(detail, objectStorage),
                    submissions: detail.submissions.map(toSubmissionResponse)
                }
            };
        }
    );

    application.post(
        "/shots",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Shots"],
                summary: "Create a shot.",
                security,
                body: z.object({
                    roundId: uuidSchema.nullable().default(null),
                    sceneNumber: z.number().int().positive().max(100_000),
                    shotCode: fieldRules.shotCode,
                    title: fieldRules.shotTitle,
                    description: fieldRules.shotDescription.default(null),
                    difficultyTier: z.enum(DifficultyTier),
                    seniorPriorityHours: z.number().int().min(0).max(168).default(0),
                    imageKeys: fieldRules.shotImageKeys.default([])
                }),
                response: { 201: dataEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const shot = await shotsService.create(request.body);
            return reply.status(201).send({
                data: toShotResponse({ shot, claimer: null, latestSubmission: null, isSeniorLocked: false }, objectStorage)
            });
        }
    );

    application.patch(
        "/shots/:shotId",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Shots"],
                summary: "Edit shot metadata. Lifecycle changes go through claim, release, submit and review.",
                security,
                params: shotParams,
                body: z
                    .object({
                        roundId: uuidSchema.nullable().optional(),
                        sceneNumber: z.number().int().positive().max(100_000).optional(),
                        shotCode: fieldRules.shotCode.optional(),
                        title: fieldRules.shotTitle.optional(),
                        description: fieldRules.shotDescription.optional(),
                        difficultyTier: z.enum(DifficultyTier).optional(),
                        imageKeys: fieldRules.shotImageKeys.optional()
                    })
                    .refine((body) => Object.keys(body).length > 0, "at least one field is required"),
                response: { 200: dataEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request) => {
            await shotsService.update(request.params.shotId, request.body);
            return {
                data: toShotResponse(await shotsService.getDetail(request.params.shotId, currentUser(request)), objectStorage)
            };
        }
    );

    application.delete(
        "/shots/:shotId",
        {
            preHandler: requireRole(Role.Admin),
            schema: {
                tags: ["Shots"],
                summary: "Delete a shot and its submissions.",
                security,
                params: shotParams,
                response: { 204: z.null().describe("Deleted"), ...errorResponses }
            }
        },
        async (request, reply) => {
            await shotsService.delete(request.params.shotId);
            return reply.status(204).send(null);
        }
    );

    application.post(
        "/shots/:shotId/claim",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Shots"],
                summary: "Claim an available shot. Users may hold one active claim at a time.",
                security,
                params: shotParams,
                response: { 200: dataEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = currentUser(request);
            await shotsService.claim(user, request.params.shotId);
            return { data: toShotResponse(await shotsService.getDetail(request.params.shotId, user), objectStorage) };
        }
    );

    application.post(
        "/shots/:shotId/release",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Shots"],
                summary: "Return a claimed shot to the pool.",
                security,
                params: shotParams,
                body: z.object({ reason: fieldRules.reason.default(null) }).default({ reason: null }),
                response: { 200: dataEnvelope(shotSchema), ...errorResponses }
            }
        },
        async (request) => {
            const user = currentUser(request);
            await shotsService.release(user, request.params.shotId, request.body.reason);
            return { data: toShotResponse(await shotsService.getDetail(request.params.shotId, user), objectStorage) };
        }
    );

    application.post(
        "/shots/:shotId/uploads",
        {
            preHandler: requireUser(),
            config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
            schema: {
                tags: ["Shots"],
                summary: "Request a pre-signed URL for uploading a deliverable for your claimed shot.",
                security,
                params: shotParams,
                body: z.object({
                    kind: z.enum(DeliverableKind),
                    fileName: z.string().min(1).max(255),
                    contentType: z.enum(allDeliverableTypes),
                    sizeBytes: z.number().int().min(1).max(configuration.storage.deliverableMaxBytes)
                }),
                response: { 201: dataEnvelope(presignedUploadSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const user = currentUser(request);
            await consumeUploadQuota(services.keyValueStore, UploadQuota.Deliverable, user.id);
            const upload = await shotsService.createDeliverableUpload(user, request.params.shotId, request.body);
            return reply.status(201).send({ data: toPresignedUploadResponse(upload) });
        }
    );

    application.post(
        "/shots/:shotId/submissions",
        {
            preHandler: requireUser(),
            schema: {
                tags: ["Shots"],
                summary: "Submit uploaded deliverables for review. Submitting grants the contributor role.",
                security,
                params: shotParams,
                body: z.object({
                    videoKey: z.string().min(1).max(512),
                    blendKey: z.string().min(1).max(512),
                    notes: fieldRules.workNotes.default(null)
                }),
                response: { 201: dataEnvelope(submissionSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const user = currentUser(request);
            const submission = await shotsService.submit(user, request.params.shotId, request.body);
            const detail = await shotsService.getDetail(request.params.shotId, user);
            const view = detail.submissions.find((item) => item.submission.id === submission.id);
            return reply.status(201).send({
                data: toSubmissionResponse(view ?? { submission, contributor: null, reviewer: null, videoUrl: null, blendUrl: null })
            });
        }
    );

    application.post(
        "/shots/reclaim-expired",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Shots"],
                summary: "Return every claim past its deadline to the pool.",
                security,
                response: {
                    200: dataEnvelope(z.object({ reclaimedCount: z.number().int(), shotCodes: z.array(z.string()) })),
                    ...errorResponses
                }
            }
        },
        async () => {
            const result = await shotsService.reclaimExpired();
            return { data: { reclaimedCount: result.reclaimedCount, shotCodes: [...result.shotCodes] } };
        }
    );

    application.get(
        "/reviews",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Reviews"],
                summary: "Submissions awaiting review, oldest first.",
                security,
                querystring: paginationQuerySchema,
                response: { 200: pageEnvelope(reviewQueueItemSchema), ...errorResponses }
            }
        },
        async (request, reply) => {
            const page = await reviewsService.queue(request.query);
            void reply.header("Cache-Control", "private, no-store");
            return { data: page.data.map((item) => toReviewQueueResponse(item, objectStorage)), meta: page.meta };
        }
    );

    application.post(
        "/submissions/:submissionId/review",
        {
            preHandler: supervisor,
            schema: {
                tags: ["Reviews"],
                summary: "Approve a submission or request a revision.",
                security,
                params: z.object({ submissionId: uuidSchema }),
                body: z.object({ decision: z.enum(ReviewDecision), notes: fieldRules.reviewNotes.default(null) }),
                response: { 200: dataEnvelope(submissionSchema), ...errorResponses }
            }
        },
        async (request) => {
            const submission = await reviewsService.review(
                userActorOf(request),
                request.params.submissionId,
                request.body.decision,
                request.body.notes
            );
            return { data: toSubmissionResponse({ submission, contributor: null, reviewer: null, videoUrl: null, blendUrl: null }) };
        }
    );
};
