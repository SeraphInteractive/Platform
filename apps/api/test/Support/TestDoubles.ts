import type { CaptchaVerifier } from "../../src/Infrastructure/Captcha/CaptchaVerifier.js";
import type { EmailMessage, EmailSender } from "../../src/Infrastructure/Email/EmailSender.js";
import type { MailDomainChecker } from "../../src/Infrastructure/Email/MailDomainChecker.js";
import type { NotificationInput } from "../../src/Infrastructure/Notifications/Notification.js";
import { StreamNotifier } from "../../src/Infrastructure/Notifications/NotificationLog.js";
import { DiscordOAuthError, type DiscordOAuthClient, type DiscordProfile } from "../../src/Infrastructure/Discord/DiscordOAuthClient.js";
import { PresenceStatus, type PresenceProvider } from "../../src/Infrastructure/Discord/PresenceProvider.js";
import type {
    ObjectStorage,
    PresignedUpload,
    StorageBucket,
    StoredObjectMetadata
} from "../../src/Infrastructure/Storage/ObjectStorage.js";

export class FakeDiscordOAuthClient implements DiscordOAuthClient {
    private readonly profiles = new Map<string, DiscordProfile>();

    public register(code: string, profile: DiscordProfile): void {
        this.profiles.set(code, profile);
    }

    public buildAuthorizeUrl(state: string): string {
        return `https://discord.com/oauth2/authorize?state=${encodeURIComponent(state)}`;
    }

    public exchangeCode(code: string): Promise<string> {
        if (!this.profiles.has(code)) {
            return Promise.reject(new DiscordOAuthError("invalid code", 400));
        }
        return Promise.resolve(`access-${code}`);
    }

    public fetchProfile(accessToken: string): Promise<DiscordProfile> {
        const profile = this.profiles.get(accessToken.replace(/^access-/u, ""));
        return profile === undefined ? Promise.reject(new DiscordOAuthError("invalid token", 401)) : Promise.resolve(profile);
    }
}

export class FakePresenceProvider implements PresenceProvider {
    public getPresence(discordIds: readonly string[]): Promise<Record<string, PresenceStatus>> {
        return Promise.resolve(Object.fromEntries(discordIds.map((id) => [id, PresenceStatus.Online])));
    }
}

export class FakeObjectStorage implements ObjectStorage {
    private readonly objects = new Map<string, StoredObjectMetadata>();
    private readonly buffers = new Map<string, Buffer>();

    public isEnabled(): boolean {
        return true;
    }

    public createUpload(bucket: StorageBucket, key: string, contentType: string, sizeBytes: number): Promise<PresignedUpload> {
        return Promise.resolve({
            method: "PUT",
            url: `https://storage.test/${bucket}/${key}?signature=fake`,
            headers: { "Content-Type": contentType, "Content-Length": String(sizeBytes) },
            key,
            expiresAt: new Date(Date.now() + 900_000)
        });
    }

    public store(bucket: StorageBucket, key: string, sizeBytes: number, contentType: string, data?: Buffer): void {
        this.objects.set(`${bucket}:${key}`, { sizeBytes, contentType });
        if (data !== undefined) {
            this.buffers.set(`${bucket}:${key}`, data);
        } else {
            let defaultBuf: Buffer;
            if (contentType === "image/png") {
                defaultBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
            } else if (contentType === "image/jpeg") {
                defaultBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
            } else if (contentType === "video/webm") {
                defaultBuf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]);
            } else if (key.endsWith(".blend")) {
                defaultBuf = Buffer.from("BLENDER_v300_dummy_test_project");
            } else {
                defaultBuf = Buffer.from("\x00\x00\x00\x18ftypisom\x00\x00\x02\x00");
            }
            this.buffers.set(`${bucket}:${key}`, defaultBuf);
        }
    }

    public getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        return Promise.resolve(this.objects.get(`${bucket}:${key}`) ?? null);
    }

    public getObject(bucket: StorageBucket, key: string, maxBytes?: number): Promise<Buffer | null> {
        const buf = this.buffers.get(`${bucket}:${key}`);
        if (buf === undefined) {
            return Promise.resolve(null);
        }
        return Promise.resolve(maxBytes !== undefined && maxBytes > 0 ? buf.subarray(0, maxBytes) : buf);
    }

    public putObject(bucket: StorageBucket, key: string, data: Buffer, contentType: string): Promise<void> {
        this.store(bucket, key, data.byteLength, contentType, data);
        return Promise.resolve();
    }

    public createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        return Promise.resolve(`https://storage.test/${bucket}/${key}?download=1`);
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        return `https://media.test/${bucket}/${key}`;
    }

    public deleteObject(bucket: StorageBucket, key: string): Promise<void> {
        this.objects.delete(`${bucket}:${key}`);
        return Promise.resolve();
    }
}

export class RecordingNotifier extends StreamNotifier {
    public readonly notifications: NotificationInput[] = [];

    public override notify(notification: NotificationInput): void {
        this.notifications.push(notification);
        super.notify(notification);
    }
}

export const passingCaptchaToken = "captcha-pass";

export class FakeCaptchaVerifier implements CaptchaVerifier {
    public verify(token: string): Promise<boolean> {
        return Promise.resolve(token === passingCaptchaToken);
    }
}

export class FakeMailDomainChecker implements MailDomainChecker {
    public acceptsMail(domain: string): Promise<boolean> {
        return Promise.resolve(!domain.endsWith(".invalid"));
    }
}

export class RecordingEmailSender implements EmailSender {
    public readonly messages: EmailMessage[] = [];

    public isEnabled(): boolean {
        return true;
    }

    public send(message: EmailMessage): Promise<void> {
        this.messages.push(message);
        return Promise.resolve();
    }

    public lastCode(): string | null {
        return /\d{6}/u.exec(this.messages.at(-1)?.text ?? "")?.[0] ?? null;
    }
}
