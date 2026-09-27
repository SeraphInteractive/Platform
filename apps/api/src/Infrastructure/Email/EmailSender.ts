export interface EmailMessage {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html: string;
    readonly idempotencyKey: string;
}

export interface EmailSender {
    isEnabled(): boolean;
    send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
    public constructor(
        message: string,
        public readonly status: number
    ) {
        super(message);
        this.name = "EmailDeliveryError";
    }
}
