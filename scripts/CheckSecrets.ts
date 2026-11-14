import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// scan git tracked and staged files to prevent any live discord webhooks from entering git
const discordWebhookPattern =
    /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([A-Za-z0-9_-]+)/g;

function getTrackedFiles(): string[] {
    try {
        const tracked = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n");
        const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).trim().split("\n");
        return Array.from(new Set([...tracked, ...staged])).filter(
            (file) => file.length > 0 && !file.endsWith(".png") && !file.endsWith(".jpg") && !file.endsWith(".ico")
        );
    } catch {
        return [];
    }
}

function scan(): void {
    const files = getTrackedFiles();
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of files) {
        let content: string;
        try {
            content = readFileSync(file, "utf8");
        } catch {
            continue;
        }

        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line === undefined) {
                continue;
            }
            let match: RegExpExecArray | null;
            discordWebhookPattern.lastIndex = 0;
            while ((match = discordWebhookPattern.exec(line)) !== null) {
                const token = match[2];
                if (token === undefined) {
                    continue;
                }
                // permit explicit mock stubs in test fixtures
                const isMock =
                    token.includes("mock_") || token.startsWith("token") || token.startsWith("test") || token.includes("000000000000");
                if (!isMock) {
                    violations.push({
                        file,
                        line: i + 1,
                        match: match[0]
                    });
                }
            }
        }
    }

    if (violations.length > 0) {
        process.stderr.write("FATAL: Live Discord webhook URL detected in tracked files!\n");
        for (const v of violations) {
            process.stderr.write(`  ${v.file}:${v.line} -> ${v.match}\n`);
        }
        process.stderr.write("\nWebhooks must NEVER be stored in code or committed to git.\n");
        process.stderr.write("Store webhooks in the database or use mock stubs in unit tests.\n");
        process.exit(1);
    }

    process.stdout.write("Secret check passed: zero live Discord webhook credentials detected in tracked files.\n");
}

scan();
