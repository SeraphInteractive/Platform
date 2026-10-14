import type { JSONContent } from "@tiptap/react";

export function exportToFountain(doc: JSONContent, title = "Untitled Script", author?: string): string {
    const lines: string[] = [`Title: ${title}`];
    if (author) {
        lines.push("Credit: Written by", `Author: ${author}`);
    }
    lines.push("\n");

    if (doc.content && Array.isArray(doc.content)) {
        for (const node of doc.content) {
            const type = node.type || "action";
            if (node.type === "scriptImage") {
                lines.push(`\n[[STORYBOARD: ${node.attrs?.caption || "Image"}]]\n`);
                continue;
            }
            let text = "";
            if (node.content && Array.isArray(node.content)) {
                text = node.content.map((c) => (c.type === "hardBreak" ? "\n" : c.text || "")).join("");
            }

            switch (type) {
                case "pageBreak":
                    lines.push("\n===\n");
                    break;
                case "sceneHeading":
                    lines.push(`\n${text.toUpperCase()}\n`);
                    break;
                case "character":
                    lines.push(`\n${text.toUpperCase()}`);
                    break;
                case "parenthetical":
                    lines.push(text.startsWith("(") ? text : `(${text})`);
                    break;
                case "dialogue":
                    lines.push(text);
                    break;
                case "transition":
                    lines.push(`\n> ${text.toUpperCase()}\n`);
                    break;
                case "action":
                default:
                    lines.push(`\n${text}`);
                    break;
            }
        }
    }

    return lines.join("\n");
}

export function parseFountain(fountainText: string): JSONContent {
    const rawLines = fountainText.split(/\r?\n/);
    const content: JSONContent[] = [];
    let isPreviousCharacterOrParen = false;

    for (let i = 0; i < rawLines.length; i++) {
        const raw = rawLines[i] ?? "";
        const trimmed = raw.trim();
        if (!trimmed) {
            isPreviousCharacterOrParen = false;
            continue;
        }

        // page break detection (industry standard Fountain: 3 or more equals signs)
        if (/^={3,}$/.test(trimmed)) {
            content.push({ type: "pageBreak" });
            isPreviousCharacterOrParen = false;
            continue;
        }

        // scene heading detection
        if (/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.|\.[A-Z0-9])/i.test(trimmed)) {
            content.push({
                type: "sceneHeading",
                content: [{ type: "text", text: trimmed.replace(/^\./, "").toUpperCase() }]
            });
            isPreviousCharacterOrParen = false;
            continue;
        }

        // transition detection
        if (/^>.*|<$/i.test(trimmed) || /TO:$/i.test(trimmed)) {
            content.push({
                type: "transition",
                content: [{ type: "text", text: trimmed.replace(/^>|\s*<$/g, "").toUpperCase() }]
            });
            isPreviousCharacterOrParen = false;
            continue;
        }

        // parenthetical detection
        if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
            content.push({
                type: "parenthetical",
                content: [{ type: "text", text: trimmed }]
            });
            isPreviousCharacterOrParen = true;
            continue;
        }

        // character detection: all uppercase and next line is not blank
        const isUppercase = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        if (isUppercase && !isPreviousCharacterOrParen && trimmed.length < 40) {
            content.push({
                type: "character",
                content: [{ type: "text", text: trimmed }]
            });
            isPreviousCharacterOrParen = true;
            continue;
        }

        // dialogue detection: immediately following character or parenthetical
        if (isPreviousCharacterOrParen) {
            content.push({
                type: "dialogue",
                content: [{ type: "text", text: trimmed }]
            });
            continue;
        }

        // default to action
        content.push({
            type: "action",
            content: [{ type: "text", text: trimmed }]
        });
        isPreviousCharacterOrParen = false;
    }

    return {
        type: "doc",
        content:
            content.length > 0
                ? content
                : [
                      { type: "sceneHeading", content: [{ type: "text", text: "INT. STUDIO - DAY" }] },
                      { type: "action", content: [{ type: "text", text: "Screenplay content begins here." }] }
                  ]
    };
}
