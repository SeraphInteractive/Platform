import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import type { CaptchaVerifier } from "./CaptchaVerifier.js";

const endpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const timeoutMs = 8_000;

const responseSchema = z.object({
    success: z.boolean(),
    action: z.string().optional(),
    hostname: z.string().optional()
});

export class TurnstileVerifier implements CaptchaVerifier {
    public constructor(
        private readonly secretKey: string,
        private readonly allowedHostnames: readonly string[],
        private readonly logger: FastifyBaseLogger
    ) {}

    public async verify(token: string, action: string): Promise<boolean> {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({ secret: this.secretKey, response: token }),
                signal: AbortSignal.timeout(timeoutMs)
            });
            const parsed = responseSchema.safeParse(await response.json());
            if (!parsed.success || !parsed.data.success) {
                return false;
            }
            return (
                parsed.data.action === action && parsed.data.hostname !== undefined && this.allowedHostnames.includes(parsed.data.hostname)
            );
        } catch (error: unknown) {
            this.logger.warn({ err: error }, "turnstile verification failed");
            return false;
        }
    }
}

export class DisabledCaptchaVerifier implements CaptchaVerifier {
    public verify(): Promise<boolean> {
        return Promise.resolve(true);
    }
}
