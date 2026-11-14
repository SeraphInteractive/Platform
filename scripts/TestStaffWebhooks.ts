import { fileURLToPath } from "node:url";

try {
    process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
    // env file optional
}

const allowedDiscordHosts = new Set(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"]);

interface WebhookTarget {
    label: string;
    url: URL;
}

function sanitizeDiscordWebhookUrl(rawUrl: string): URL | null {
    try {
        const parsed = new URL(rawUrl.trim());
        if (parsed.protocol !== "https:") {
            return null;
        }
        const host = parsed.hostname.toLowerCase();
        if (!allowedDiscordHosts.has(host)) {
            return null;
        }
        if (!/^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]{20,80}$/.test(parsed.pathname)) {
            return null;
        }
        parsed.search = "with_components=true";
        parsed.hash = "";
        return parsed;
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    const staffWebhookKeys = [
        "taskLogs",
        "task-logs",
        "votingLogs",
        "voting-logs",
        "userLogs",
        "user-logs",
        "securityAlerts",
        "security-alerts",
        "telemetry",
        "systemLogs",
        "system-logs",
        "moderationLogs",
        "moderation-logs"
    ];

    const targets: WebhookTarget[] = [];
    const seenUrls = new Set<string>();

    const cliUrls = process.argv.slice(2);
    for (const [index, raw] of cliUrls.entries()) {
        const parsed = sanitizeDiscordWebhookUrl(raw);
        if (parsed && !seenUrls.has(parsed.href)) {
            seenUrls.add(parsed.href);
            targets.push({ label: `cli-arg-${index + 1}`, url: parsed });
        }
    }

    for (const key of staffWebhookKeys) {
        const envVal = process.env[`WEBHOOK_${key.toUpperCase().replace(/-/g, "_")}`];
        if (typeof envVal === "string" && envVal.length > 0) {
            const parsed = sanitizeDiscordWebhookUrl(envVal);
            if (parsed && !seenUrls.has(parsed.href)) {
                seenUrls.add(parsed.href);
                targets.push({ label: key, url: parsed });
            }
        }
    }

    if (targets.length === 0) {
        process.stdout.write("no valid discord staff webhooks found in arguments or env variables.\n");
        process.stdout.write("usage: npx tsx scripts/TestStaffWebhooks.ts <webhook_url...> or define WEBHOOK_<PURPOSE>\n");
        return;
    }

    const payload = {
        username: "Project Stairway Staff Probe",
        flags: 32768,
        components: [
            {
                type: 17,
                accent_color: 0x3498db,
                components: [
                    {
                        type: 10,
                        content: "### test\nVerification probe across staff logging channels."
                    }
                ]
            }
        ]
    };

    for (const target of targets) {
        // redundant host check for static analysis and ssrf guard
        if (
            target.url.protocol !== "https:" ||
            (target.url.hostname !== "discord.com" &&
                target.url.hostname !== "discordapp.com" &&
                target.url.hostname !== "canary.discord.com" &&
                target.url.hostname !== "ptb.discord.com")
        ) {
            continue;
        }

        try {
            const res = await fetch(target.url.href, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                process.stdout.write(`delivered test probe to ${target.label} (${res.status})\n`);
            } else {
                const text = await res.text().catch(() => "");
                process.stderr.write(`failed to deliver to ${target.label}: ${res.status} ${text}\n`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`network error delivering to ${target.label}: ${msg}\n`);
        }
    }
}

void main();
