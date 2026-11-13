import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));

async function main(): Promise<void> {
    const dataDir = process.env.DATA_DIRECTORY ?? "./data";
    const settingsPath = join(dataDir, "settings.json");

    let webhooks: Record<string, string> = {};

    try {
        const raw = await readFile(settingsPath, "utf8");
        const parsed = JSON.parse(raw) as { webhooks?: Record<string, string> };
        if (parsed && typeof parsed.webhooks === "object" && parsed.webhooks !== null) {
            webhooks = parsed.webhooks;
        }
    } catch {
        process.stdout.write("could not read settings.json from data directory, checking env...\n");
    }

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

    const targets: { label: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    for (const key of staffWebhookKeys) {
        const url = webhooks[key] ?? process.env[`WEBHOOK_${key.toUpperCase().replace(/-/g, "_")}`];
        if (url && typeof url === "string" && !seenUrls.has(url)) {
            seenUrls.add(url);
            targets.push({ label: key, url });
        }
    }

    if (targets.length === 0) {
        process.stdout.write("no staff webhooks found in settings.json or env variables.\n");
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
        const targetUrl = target.url.includes("?") ? `${target.url}&with_components=true` : `${target.url}?with_components=true`;
        try {
            const res = await fetch(targetUrl, {
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
