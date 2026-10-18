import { countryName, guardianRelationshipLabels, regionName, type ClaReceiptDto, type GuardianRelationship } from "@platform/contracts";

export interface ComposedEmail {
    readonly subject: string;
    readonly text: string;
    readonly html: string;
}

export function escapeHtml(value: string): string {
    return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function htmlToText(html: string): string {
    return html
        .replace(/<br\s*\/?>/giu, "\n")
        .replace(/<\/(?:p|li|h[1-6]|tr|blockquote)>/giu, "\n")
        .replace(/<li[^>]*>/giu, "- ")
        .replace(/<[^>]+>/gu, "")
        .replace(/&nbsp;/gu, " ")
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/&amp;/gu, "&")
        .replace(/\n{3,}/gu, "\n\n")
        .trim();
}

function formatDate(iso: string): string {
    return new Date(iso).toUTCString();
}

function paragraphs(lines: readonly string[]): string {
    return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

export function guardianRequestEmail(input: {
    readonly guardianName: string;
    readonly contributorName: string;
    readonly username: string;
    readonly relationship: GuardianRelationship;
    readonly documentTitle: string;
    readonly link: string;
    readonly expiresAt: Date;
}): ComposedEmail {
    const lines = [
        `Hi ${input.guardianName},`,
        `${input.contributorName} (${input.username} on Project Stairway) signed the ${input.documentTitle} and named you as their ${guardianRelationshipLabels[input.relationship].toLowerCase()}.`,
        "Because they are under the age of majority where they live, they need your consent before they can contribute work.",
        `Review the agreement and approve or decline by ${formatDate(input.expiresAt.toISOString())}:`
    ];
    const footer = "If you don't know this person, ignore this email and the request will expire.";
    return {
        subject: `Consent requested for ${input.contributorName}`,
        text: `${lines.join("\n\n")}\n\n${input.link}\n\n${footer}`,
        html: `${paragraphs(lines)}<p><a href="${escapeHtml(input.link)}">Review the request</a></p><p>${escapeHtml(footer)}</p>`
    };
}

export function receiptEmail(receipt: ClaReceiptDto, recipient: "contributor" | "guardian"): ComposedEmail {
    const region = regionName(receipt.contributor.country, receipt.contributor.region);
    const residence = region === null ? countryName(receipt.contributor.country) : `${region}, ${countryName(receipt.contributor.country)}`;
    const facts: [string, string][] = [
        ["Agreement", `${receipt.document.title}, revision ${receipt.document.revision}`],
        ["Agreement fingerprint (SHA-256)", receipt.document.hash],
        ["Reference", receipt.signatureId],
        ["Contributor", `${receipt.contributor.legalName} (${receipt.contributor.username})`],
        ["Residence", residence],
        ["Signed", formatDate(receipt.contributor.signedAt)]
    ];
    if (receipt.guardian !== null) {
        facts.push(
            ["Guardian", `${receipt.guardian.legalName} (${guardianRelationshipLabels[receipt.guardian.relationship]})`],
            ["Guardian consent", receipt.guardian.consentedAt === null ? "Pending" : formatDate(receipt.guardian.consentedAt)]
        );
    }
    if (receipt.activatedAt !== null) {
        facts.push(["In effect from", formatDate(receipt.activatedAt)]);
    }
    const intro =
        recipient === "guardian"
            ? `This is your copy of the ${receipt.document.title} you consented to for ${receipt.contributor.legalName}.`
            : `This is your copy of the ${receipt.document.title} you signed.`;
    const agreementText = receipt.document.sections.map((section) => `${section.title}\n\n${htmlToText(section.html)}`).join("\n\n");
    const agreementHtml = receipt.document.sections.map((section) => `<h3>${escapeHtml(section.title)}</h3>${section.html}`).join("");
    return {
        subject: `Your copy of the ${receipt.document.title}`,
        text: `${intro}\n\n${facts.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n---\n\n${agreementText}`,
        html: `<p>${escapeHtml(intro)}</p><table>${facts
            .map(
                ([label, value]) =>
                    `<tr><td style="padding-right:12px;color:#666">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`
            )
            .join("")}</table><hr>${agreementHtml}`
    };
}

export function guardianDeclinedEmail(input: { readonly contributorName: string; readonly documentTitle: string }): ComposedEmail {
    const lines = [
        `Hi ${input.contributorName},`,
        `Your guardian declined to consent to the ${input.documentTitle}, so it is not in effect.`,
        "You can sign again from the platform if you'd like to name a different guardian."
    ];
    return { subject: `Guardian consent declined`, text: lines.join("\n\n"), html: paragraphs(lines) };
}

export function revocationEmail(input: {
    readonly contributorName: string;
    readonly documentTitle: string;
    readonly revokedAt: Date;
    readonly byStaff: boolean;
}): ComposedEmail {
    const lines = [
        `Hi ${input.contributorName},`,
        `Your ${input.documentTitle} was ${input.byStaff ? "revoked by the project team" : "revoked at your request"} on ${formatDate(input.revokedAt.toISOString())}.`,
        "You can't claim or submit new work until you sign again. Work you already submitted stays under the agreement that covered it."
    ];
    return { subject: `${input.documentTitle} revoked`, text: lines.join("\n\n"), html: paragraphs(lines) };
}
