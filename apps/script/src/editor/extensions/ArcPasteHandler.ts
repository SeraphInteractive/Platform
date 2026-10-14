import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/react";

export interface ArcPasteOptions {
    onNotice?: (msg: string) => void;
}

export function parseArcStudioHtml(html: string): JSONContent[] | null {
    if (typeof window === "undefined") return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // check if html contains arc studio specific classes
    const hasArcElements = doc.querySelector(
        ".page-section, .paragraph-content, [class*='paragraph-'], .paragraph-scene, .paragraph-dialogue, .paragraph-character"
    );
    if (!hasArcElements) return null;

    const nodes: JSONContent[] = [];
    const sections = doc.querySelectorAll(".page-section, .paragraph-content, .page-break");

    // helper to extract clean text from paragraph container
    const extractText = (el: Element): string => {
        const textEl = el.querySelector(".paragraph-text") || el;
        // remove scene number if duplicated inside text
        const clone = textEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll(".paragraph-scene-number, .page-break-offset, .no-sel").forEach((n) => n.remove());
        return (clone.textContent || "").trim();
    };

    // track whether element was handled to avoid double processing nested containers
    const handledElements = new Set<Element>();

    sections.forEach((sec) => {
        if (handledElements.has(sec)) return;

        // check page break
        if (sec.classList.contains("page-break") || sec.querySelector(".page-break")) {
            const numEl = sec.querySelector(".page-number, [data-page-number]");
            let pageNum = 2;
            if (numEl) {
                const match = numEl.textContent?.match(/\d+/);
                if (match) pageNum = parseInt(match[0], 10);
            }
            nodes.push({
                type: "pageBreak",
                attrs: { pageNumber: pageNum }
            });
            handledElements.add(sec);
            return;
        }

        const contentEl = sec.classList.contains("paragraph-content") ? sec : sec.querySelector(".paragraph-content") || sec;

        if (handledElements.has(contentEl)) return;
        handledElements.add(contentEl);
        handledElements.add(sec);

        const classList = Array.from(contentEl.classList);

        // 1. Scene heading
        if (classList.some((c) => c.includes("paragraph-scene") || c.includes("paragraph-heading"))) {
            const sceneNumEl = sec.querySelector(".paragraph-scene-number, [data-scene-number]");
            const sceneNum = sceneNumEl ? sceneNumEl.textContent?.trim() || null : null;
            const text = extractText(contentEl);
            if (text) {
                nodes.push({
                    type: "sceneHeading",
                    attrs: sceneNum ? { sceneNumber: sceneNum } : {},
                    content: [{ type: "text", text: text.toUpperCase() }]
                });
            }
            return;
        }

        // 2. Character
        if (classList.some((c) => c.includes("paragraph-character"))) {
            const text = extractText(contentEl);
            if (text) {
                nodes.push({
                    type: "character",
                    content: [{ type: "text", text: text.toUpperCase() }]
                });
            }
            return;
        }

        // 3. Parenthetical
        if (classList.some((c) => c.includes("paragraph-parenthetical") || c.includes("paragraph-parens"))) {
            let text = extractText(contentEl);
            if (text) {
                if (!text.startsWith("(")) text = `(${text}`;
                if (!text.endsWith(")")) text = `${text})`;
                nodes.push({
                    type: "parenthetical",
                    content: [{ type: "text", text }]
                });
            }
            return;
        }

        // 4. Dialogue
        if (classList.some((c) => c.includes("paragraph-dialogue"))) {
            const text = extractText(contentEl);
            if (text) {
                nodes.push({
                    type: "dialogue",
                    content: [{ type: "text", text }]
                });
            }
            return;
        }

        // 5. Transition
        if (classList.some((c) => c.includes("paragraph-transition"))) {
            const text = extractText(contentEl);
            if (text) {
                nodes.push({
                    type: "transition",
                    content: [{ type: "text", text: text.toUpperCase() }]
                });
            }
            return;
        }

        // 6. Action or fallback
        const text = extractText(contentEl);
        if (text) {
            nodes.push({
                type: "action",
                content: [{ type: "text", text }]
            });
        }
    });

    return nodes.length > 0 ? nodes : null;
}

export function parseScreenplayPlainText(text: string): JSONContent[] | null {
    if (!text || !text.trim()) return null;

    const rawLines = text.split(/\r?\n/);
    const nodes: JSONContent[] = [];
    let isPrevCharOrParen = false;

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i] ?? "";
        const trimmed = line.trim();
        if (!trimmed) {
            isPrevCharOrParen = false;
            continue;
        }

        // page break pattern
        if (/^={3,}$/.test(trimmed) || /^---+\s*(page\s*\d+)?\s*---+$/i.test(trimmed)) {
            const match = trimmed.match(/\d+/);
            const pageNum = match ? parseInt(match[0], 10) : 2;
            nodes.push({
                type: "pageBreak",
                attrs: { pageNumber: pageNum }
            });
            isPrevCharOrParen = false;
            continue;
        }

        // scene heading detection:
        // 1. standard INT./EXT. with or without scene numbers
        // 2. uppercase lines ending with time of day ( - DAY, - NIGHT, etc.)
        // 3. lines wrapped with scene numbers e.g. "5 PLATFORM DASHBOARD - SNEAK PEEK 5"
        const timeOfDayPattern = /\s+-\s+(DAY|NIGHT|DUSK|DAWN|MORNING|EVENING|CONTINUOUS|LATER|MOMENTS LATER)/i;
        const sceneNumLeading = trimmed.match(/^(\d+[A-Z]?)[.\s]+(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*(.*)/i);
        const sceneNumTrailing = trimmed.match(/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*(.*?)\s+(\d+[A-Z]?)$/i);
        const standardScene = /^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.|\.[A-Z0-9])/i.test(trimmed);
        const wrappedSceneNum = trimmed.match(/^(\d+[A-Z]?)\s+([A-Z0-9\s\-/.',]+?)(?:\s+(\d+[A-Z]?))?$/);

        if (sceneNumLeading) {
            const num = sceneNumLeading[1];
            const headingText = `${sceneNumLeading[2]} ${sceneNumLeading[3]}`.trim().toUpperCase();
            nodes.push({
                type: "sceneHeading",
                attrs: { sceneNumber: num },
                content: [{ type: "text", text: headingText }]
            });
            isPrevCharOrParen = false;
            continue;
        } else if (sceneNumTrailing) {
            const num = sceneNumTrailing[3];
            const headingText = `${sceneNumTrailing[1]} ${sceneNumTrailing[2]}`.trim().toUpperCase();
            nodes.push({
                type: "sceneHeading",
                attrs: { sceneNumber: num },
                content: [{ type: "text", text: headingText }]
            });
            isPrevCharOrParen = false;
            continue;
        } else if (standardScene) {
            nodes.push({
                type: "sceneHeading",
                content: [{ type: "text", text: trimmed.replace(/^\./, "").toUpperCase() }]
            });
            isPrevCharOrParen = false;
            continue;
        } else if (wrappedSceneNum && (timeOfDayPattern.test(trimmed) || trimmed.includes(" - "))) {
            const num = wrappedSceneNum[1] || wrappedSceneNum[3];
            const headingText = (wrappedSceneNum[2] || "").trim().toUpperCase();
            nodes.push({
                type: "sceneHeading",
                attrs: num ? { sceneNumber: num } : {},
                content: [{ type: "text", text: headingText }]
            });
            isPrevCharOrParen = false;
            continue;
        } else if (timeOfDayPattern.test(trimmed) && trimmed === trimmed.toUpperCase()) {
            nodes.push({
                type: "sceneHeading",
                content: [{ type: "text", text: trimmed.toUpperCase() }]
            });
            isPrevCharOrParen = false;
            continue;
        }

        // transition detection
        if (/^>.*|<$/i.test(trimmed) || (/^[A-Z\s]+TO:$/.test(trimmed) && trimmed.length < 35)) {
            nodes.push({
                type: "transition",
                content: [{ type: "text", text: trimmed.replace(/^>|\s*<$/g, "").toUpperCase() }]
            });
            isPrevCharOrParen = false;
            continue;
        }

        // parenthetical detection
        if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
            nodes.push({
                type: "parenthetical",
                content: [{ type: "text", text: trimmed }]
            });
            isPrevCharOrParen = true;
            continue;
        }

        // character detection
        // uppercase line with length < 40, not starting with scene keywords
        const isUppercase = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        const leadingSpaces = line.search(/\S|$/);
        const isIndentedCharacter = leadingSpaces >= 15 && leadingSpaces <= 28;

        if ((isUppercase && !isPrevCharOrParen && trimmed.length < 35) || isIndentedCharacter) {
            nodes.push({
                type: "character",
                content: [{ type: "text", text: trimmed }]
            });
            isPrevCharOrParen = true;
            continue;
        }

        // dialogue detection
        if (isPrevCharOrParen) {
            nodes.push({
                type: "dialogue",
                content: [{ type: "text", text: trimmed }]
            });
            continue;
        }

        // default to action
        nodes.push({
            type: "action",
            content: [{ type: "text", text: trimmed }]
        });
        isPrevCharOrParen = false;
    }

    return nodes.length > 0 ? nodes : null;
}

export const ArcPasteHandler = Extension.create<ArcPasteOptions>({
    name: "arcPasteHandler",

    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: new PluginKey("arcPasteHandler"),
                props: {
                    handlePaste: (view, event) => {
                        const clipboardData = event.clipboardData;
                        if (!clipboardData) return false;

                        const html = clipboardData.getData("text/html");
                        const text = clipboardData.getData("text/plain");

                        let parsedNodes: JSONContent[] | null = null;

                        // prioritize arc studio html if available
                        if (html && (html.includes("paragraph-") || html.includes("page-section"))) {
                            parsedNodes = parseArcStudioHtml(html);
                        }

                        // fallback to screenplay plaintext parsing
                        if (!parsedNodes && text) {
                            // only trigger custom screenplay parsing if there are multiple lines or clear cues
                            const hasScreenplayCues =
                                /(INT\.|EXT\.|I\/E\.)/i.test(text) ||
                                /\([A-Z\s]+\)/.test(text) ||
                                /\bTO:\b/.test(text) ||
                                text.split("\n").length >= 2;

                            if (hasScreenplayCues) {
                                parsedNodes = parseScreenplayPlainText(text);
                            }
                        }

                        if (parsedNodes && parsedNodes.length > 0) {
                            event.preventDefault();
                            const { state } = view;
                            const { selection, schema } = state;

                            // construct prosemirror nodes from parsed json
                            const pmNodes = parsedNodes
                                .map((json) => {
                                    try {
                                        return schema.nodeFromJSON(json);
                                    } catch {
                                        return null;
                                    }
                                })
                                .filter((n): n is NonNullable<typeof n> => n !== null);

                            if (pmNodes.length > 0) {
                                let tr = state.tr;
                                tr = tr.replaceWith(selection.from, selection.to, pmNodes);
                                view.dispatch(tr);
                                return true;
                            }
                        }

                        return false;
                    }
                }
            })
        ];
    }
});
