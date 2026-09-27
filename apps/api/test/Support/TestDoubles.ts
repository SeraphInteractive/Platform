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

    public store(bucket: StorageBucket, key: string, sizeBytes: number, contentType: string): void {
        this.objects.set(`${bucket}:${key}`, { sizeBytes, contentType });
    }

    public getMetadata(bucket: StorageBucket, key: string): Promise<StoredObjectMetadata | null> {
        return Promise.resolve(this.objects.get(`${bucket}:${key}`) ?? null);
    }

    public createDownloadUrl(bucket: StorageBucket, key: string): Promise<string> {
        return Promise.resolve(`https://storage.test/${bucket}/${key}?download=1`);
    }

    public getPublicUrl(bucket: StorageBucket, key: string): string | null {
        return `https://media.test/${bucket}/${key}`;
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
