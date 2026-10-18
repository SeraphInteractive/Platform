import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const version = "v1";
const ivLength = 12;
const tagLength = 16;

export class PiiDecryptionError extends Error {
    public constructor() {
        super("Encrypted personal data could not be decrypted.");
        this.name = "PiiDecryptionError";
    }
}

export class PiiCipher {
    private readonly key: Buffer;

    public constructor(encodedKey: string | undefined, fallbackSecret: string) {
        this.key =
            encodedKey === undefined
                ? Buffer.from(hkdfSync("sha256", fallbackSecret, "platform-pii", "pii-encryption-v1", 32))
                : Buffer.from(encodedKey, "base64");
        if (this.key.length !== 32) {
            throw new Error("The PII encryption key must be 32 bytes.");
        }
    }

    public encrypt(value: unknown, context: string): string {
        const iv = randomBytes(ivLength);
        const cipher = createCipheriv(algorithm, this.key, iv, { authTagLength: tagLength });
        cipher.setAAD(Buffer.from(context, "utf8"));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
        return [version, iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
    }

    public decrypt(payload: string, context: string): unknown {
        const [prefix, iv, ciphertext, tag] = payload.split(".");
        if (prefix !== version || iv === undefined || ciphertext === undefined || tag === undefined) {
            throw new PiiDecryptionError();
        }
        try {
            const decipher = createDecipheriv(algorithm, this.key, Buffer.from(iv, "base64url"), { authTagLength: tagLength });
            decipher.setAAD(Buffer.from(context, "utf8"));
            decipher.setAuthTag(Buffer.from(tag, "base64url"));
            const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
            return JSON.parse(plaintext.toString("utf8"));
        } catch {
            throw new PiiDecryptionError();
        }
    }
}
