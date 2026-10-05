import { emailCodeLength, emailVerificationSchema, textLimits } from "@platform/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { dataEnvelope, errorResponses, toIso } from "../../Common/Http/Schemas.js";
import { currentUser, requireAcceptedTerms } from "../../Common/Security/Authorization.js";
import type { ServiceContainer } from "../../Composition/ServiceContainer.js";
import { toUserResponse, userSchema } from "../Users/UserPresenter.js";

export const verificationRoutes: FastifyPluginAsyncZod<{ services: ServiceContainer }> = async (application, { services }) => {
    const { verificationService } = services;
    const security = [{ bearer: [] }];

    application.post(
        "/verification/email",
        {
            preHandler: requireAcceptedTerms(services.documentsService),
            config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
            schema: {
                tags: ["Verification"],
                summary: "Send a one-time code to an email address after a captcha check.",
                security,
                body: z.object({
                    email: z.string().max(textLimits.email),
                    captchaToken: z.string().min(1).max(2048)
                }),
                response: { 200: dataEnvelope(emailVerificationSchema), ...errorResponses }
            }
        },
        async (request) => {
            const started = await verificationService.start(currentUser(request), request.body.email, request.body.captchaToken);
            return { data: { expiresAt: toIso(started.expiresAt), resendAvailableAt: toIso(started.resendAvailableAt) } };
        }
    );

    application.post(
        "/verification/email/confirm",
        {
            preHandler: requireAcceptedTerms(services.documentsService),
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: {
                tags: ["Verification"],
                summary: "Confirm the emailed code and become a verified voter.",
                security,
                body: z.object({ code: z.string().length(emailCodeLength).regex(/^\d+$/u) }),
                response: { 200: dataEnvelope(userSchema), ...errorResponses }
            }
        },
        async (request) => ({ data: toUserResponse(await verificationService.confirm(currentUser(request), request.body.code)) })
    );
};
