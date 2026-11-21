import { countryName, guardianRelationshipLabels, regionName, type ClaReceiptDto } from "@platform/contracts";

function escapeHtml(value: string): string {
    return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

function formatTimestamp(value: string | null): string {
    return value === null ? "Pending" : new Date(value).toUTCString();
}

export function receiptHtml(receipt: ClaReceiptDto): string {
    const region = regionName(receipt.contributor.country, receipt.contributor.region);
    const country = countryName(receipt.contributor.country);
    const facts: [string, string][] = [
        ["Agreement", `${receipt.document.title}, revision ${receipt.document.revision}`],
        ["Agreement fingerprint (SHA-256)", receipt.document.hash],
        ["Reference", receipt.signatureId],
        ["Contributor", `${receipt.contributor.legalName} (${receipt.contributor.username})`],
        ["Email", receipt.contributor.email],
        ["Date of birth", receipt.contributor.dateOfBirth],
        ["Residence", region === null ? country : `${region}, ${country}`],
        ["Age of majority there", String(receipt.ageOfMajority)],
        ["Signed", formatTimestamp(receipt.contributor.signedAt)]
    ];
    if (receipt.guardian !== null) {
        facts.push(
            ["Guardian", `${receipt.guardian.legalName} (${guardianRelationshipLabels[receipt.guardian.relationship]})`],
            ["Guardian email", receipt.guardian.email],
            ["Guardian consent", formatTimestamp(receipt.guardian.consentedAt)]
        );
    }
    facts.push(["In effect from", formatTimestamp(receipt.activatedAt)], ["Copy issued", formatTimestamp(receipt.issuedAt)]);
    const rows = facts.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("");
    const sections = receipt.document.sections.map((section) => `<h2>${escapeHtml(section.title)}</h2>${section.html}`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(receipt.document.title)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#111}table{border-collapse:collapse;margin:16px 0 32px}th,td{text-align:left;vertical-align:top;padding:4px 16px 4px 0}th{font-weight:500;color:#555}h2{font-size:17px;margin-top:28px}</style></head><body><h1>${escapeHtml(receipt.document.title)}</h1><table>${rows}</table><hr>${sections}</body></html>`;
}

export function downloadReceipt(receipt: ClaReceiptDto): void {
    const url = URL.createObjectURL(new Blob([receiptHtml(receipt)], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `contributor-license-agreement-${receipt.signatureId.slice(0, 8)}.html`;
    link.click();
    URL.revokeObjectURL(url);
}
