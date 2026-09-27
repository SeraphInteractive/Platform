import { resolveMx } from "node:dns/promises";

export interface MailDomainChecker {
    acceptsMail(domain: string): Promise<boolean>;
}

const timeoutMs = 5_000;

export class DnsMailDomainChecker implements MailDomainChecker {
    public async acceptsMail(domain: string): Promise<boolean> {
        try {
            const records = await Promise.race([
                resolveMx(domain),
                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error("MX lookup timed out"));
                    }, timeoutMs).unref();
                })
            ]);
            return records.some((record) => record.exchange.length > 0 && record.exchange !== ".");
        } catch {
            return false;
        }
    }
}
