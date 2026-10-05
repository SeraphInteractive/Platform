import type { FastifyBaseLogger } from "fastify";
import type { EmailMessage, EmailSender } from "./EmailSender.js";

export class LogEmailSender implements EmailSender {
    public constructor(private readonly logger: FastifyBaseLogger) {}

    public isEnabled(): boolean {
        return true;
    }

    public send(message: EmailMessage): Promise<void> {
        this.logger.warn(
            { to: message.to, subject: message.subject, text: message.text },
            "email delivery disabled, logging message instead"
        );
        return Promise.resolve();
    }
}
