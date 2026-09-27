const maximumLength = 254;
const localPattern = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u;
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

const gmailDomains: ReadonlySet<string> = new Set(["gmail.com", "googlemail.com"]);

const disposableDomains: ReadonlySet<string> = new Set([
    "10minutemail.com",
    "20minutemail.com",
    "33mail.com",
    "anonaddy.me",
    "burnermail.io",
    "discard.email",
    "dispostable.com",
    "dropmail.me",
    "emailondeck.com",
    "fakeinbox.com",
    "fakemail.net",
    "getairmail.com",
    "getnada.com",
    "guerrillamail.biz",
    "guerrillamail.com",
    "guerrillamail.de",
    "guerrillamail.info",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamailblock.com",
    "harakirimail.com",
    "inboxkitten.com",
    "mail.tm",
    "mailcatch.com",
    "maildrop.cc",
    "mailinator.com",
    "mailinator.net",
    "mailnesia.com",
    "mailpoof.com",
    "mailsac.com",
    "mintemail.com",
    "moakt.com",
    "mohmal.com",
    "mytemp.email",
    "nada.email",
    "sharklasers.com",
    "spam4.me",
    "spamgourmet.com",
    "temp-mail.io",
    "temp-mail.org",
    "tempail.com",
    "tempmail.dev",
    "tempmail.net",
    "tempmailo.com",
    "tempr.email",
    "throwawaymail.com",
    "tmail.ws",
    "tmpmail.net",
    "tmpmail.org",
    "trash-mail.com",
    "trashmail.com",
    "trashmail.de",
    "yopmail.com",
    "yopmail.fr",
    "yopmail.net"
]);

export interface ParsedEmail {
    readonly address: string;
    readonly domain: string;
    readonly canonical: string;
}

export function parseEmail(input: string): ParsedEmail | null {
    const address = input.trim().toLowerCase();
    if (address.length === 0 || address.length > maximumLength) {
        return null;
    }
    const at = address.lastIndexOf("@");
    if (at <= 0) {
        return null;
    }
    const local = address.slice(0, at);
    const domain = address.slice(at + 1);
    if (local.length > 64 || !localPattern.test(local) || !domainPattern.test(domain)) {
        return null;
    }
    const withoutTag = local.split("+")[0] ?? local;
    if (withoutTag.length === 0) {
        return null;
    }
    const isGmail = gmailDomains.has(domain);
    const canonicalLocal = isGmail ? withoutTag.replaceAll(".", "") : withoutTag;
    const canonicalDomain = isGmail ? "gmail.com" : domain;
    return { address, domain, canonical: `${canonicalLocal}@${canonicalDomain}` };
}

export function isDisposableDomain(domain: string): boolean {
    const labels = domain.split(".");
    for (let index = 0; index < labels.length - 1; index++) {
        if (disposableDomains.has(labels.slice(index).join("."))) {
            return true;
        }
    }
    return false;
}
