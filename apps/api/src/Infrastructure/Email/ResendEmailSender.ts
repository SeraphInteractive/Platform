import type { EmailConfiguration } from "../../Configuration/ApplicationConfiguration.js";
import { EmailDeliveryError, type EmailMessage, type EmailSender } from "./EmailSender.js";

const endpoint = "https://api.resend.com/emails";
const timeoutMs = 10_000;

export class ResendEmailSender implements EmailSender {
    public constructor(private readonly configuration: EmailConfiguration) {}

    public isEnabled(): boolean {
        return this.configuration.resendApiKey !== undefined && this.configuration.from !== undefined;
    }

    public async send(message: EmailMessage): Promise<void> {
        const { resendApiKey, from } = this.configuration;
        if (resendApiKey === undefined || from === undefined) {
            throw new EmailDeliveryError("Email delivery is not configured.", 503);
        }
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": message.idempotencyKey
            },
            body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
            signal: AbortSignal.timeout(timeoutMs)
        });
        if (!response.ok) {
            throw new EmailDeliveryError(`Resend rejected the message with status ${response.status}.`, response.status);
        }
    }
}
