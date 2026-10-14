import { describe, it, expect } from "vitest";
import {
    countBlockLines,
    estimateBlockLines,
    computePagination,
    SCREENPLAY_PAGE_BUDGET_LINES,
    type PaginationStorage
} from "./ScreenplayPagination";
import { HardBreakLeafText } from "./HardBreakLeafText";

describe("ScreenplayPagination Line Estimation", () => {
    it("counts single line and empty text correctly", () => {
        expect(countBlockLines("", 60)).toBe(1);
        expect(countBlockLines("Short line of text", 60)).toBe(1);
    });

    it("wraps long lines based on characters per line", () => {
        const text60 = "a".repeat(60);
        expect(countBlockLines(text60, 60)).toBe(1);

        const text120 = "a".repeat(120);
        expect(countBlockLines(text120, 60)).toBe(2);

        const text150 = "a".repeat(150);
        expect(countBlockLines(text150, 60)).toBe(3);
    });

    it("accounts for hard breaks and empty lines", () => {
        const twoLines = "Line 1\nLine 2";
        expect(countBlockLines(twoLines, 60)).toBe(2);

        // 5 consecutive newlines create 6 segments
        const emptyBreaks = "\n\n\n\n\n";
        expect(countBlockLines(emptyBreaks, 60)).toBe(6);

        // mixed lines with blank breaks
        const mixed = "Header\n\nParagraph with text\n\nFooter";
        expect(countBlockLines(mixed, 60)).toBe(5);
    });

    it("estimates block lines including margins for screenplay elements", () => {
        // mock prosemirror node
        const createMockNode = (type: string, text: string, hardBreaks = 0) => {
            const children: any[] = [];
            if (text) {
                children.push({ isText: true, text, type: { name: "text" } });
            }
            for (let i = 0; i < hardBreaks; i++) {
                children.push({ isText: false, type: { name: "hardBreak" } });
            }
            return {
                type: { name: type },
                textContent: text,
                forEach: (fn: (child: any) => void) => {
                    children.forEach(fn);
                }
            } as any;
        };

        // standard action: 1 line text + 1 line margin = 2
        const actionNode = createMockNode("action", "John looks around the empty room.");
        expect(estimateBlockLines(actionNode)).toBe(2);

        // action with 10 hard breaks: 1 text + 10 breaks = 11 lines + 1 margin = 12
        const actionWithBreaks = createMockNode("action", "Start", 10);
        expect(estimateBlockLines(actionWithBreaks)).toBe(12);

        // dialogue wrapped at 35 chars: 70 chars = 2 lines + 1 margin = 3
        const dialogueNode = createMockNode("dialogue", "a".repeat(70));
        expect(estimateBlockLines(dialogueNode)).toBe(3);

        // page budget constant check
        expect(SCREENPLAY_PAGE_BUDGET_LINES).toBe(58);
    });

    it("declares leafText for hardBreak in HardBreakLeafText extension", () => {
        const ext = HardBreakLeafText.config as any;
        const schema = ext.extendNodeSchema?.({ name: "hardBreak" });
        expect(schema?.leafText?.()).toBe("\n");

        const otherSchema = ext.extendNodeSchema?.({ name: "paragraph" });
        expect(otherSchema).toEqual({});
    });
});

describe("ScreenplayPagination Speech Orphan Prevention", () => {
    // helper to create a mock ProseMirror document with child nodes
    function createMockDoc(nodeDefs: Array<{ type: string; text?: string; breaks?: number; offset: number }>) {
        const children = nodeDefs.map((def) => {
            const innerChildren: any[] = [];
            if (def.text) {
                innerChildren.push({ isText: true, text: def.text, type: { name: "text" } });
            }
            for (let i = 0; i < (def.breaks || 0); i++) {
                innerChildren.push({ isText: false, type: { name: "hardBreak" } });
            }
            return {
                node: {
                    type: { name: def.type },
                    textContent: def.text || "",
                    forEach: (fn: (child: any) => void) => innerChildren.forEach(fn)
                },
                offset: def.offset
            };
        });

        return {
            forEach: (fn: (child: any, offset: number) => void) => {
                children.forEach((c) => fn(c.node, c.offset));
            }
        } as any;
    }

    it("prevents character from being orphaned when dialogue cannot fit on page", () => {
        // fill page to 54 lines with actions (27 actions * 2 lines each = 54 lines)
        const nodes: Array<{ type: string; text?: string; breaks?: number; offset: number }> = [];
        let offset = 0;
        for (let i = 0; i < 27; i++) {
            nodes.push({ type: "action", text: `Action beat ${i}`, offset });
            offset += 30;
        }

        // character cue (2 lines) followed by dialogue (4 lines)
        const charOffset = offset;
        nodes.push({ type: "character", text: "MATT (V.O.)", offset: charOffset });
        offset += 20;

        const dialogueOffset = offset;
        nodes.push({
            type: "dialogue",
            text: "This is a meaningful line of dialogue that must stay with Matt.",
            offset: dialogueOffset
        });

        const doc = createMockDoc(nodes);
        const storage: PaginationStorage = {
            totalPages: 1,
            currentPage: 1,
            scenePages: {},
            pageBoundaries: []
        };

        computePagination(doc, storage);

        // page 1 starts at 0, page 2 MUST break BEFORE character (charOffset), not between character and dialogue
        expect(storage.pageBoundaries.length).toBe(2);
        expect(storage.pageBoundaries[0]).toEqual({ pos: 0, pageNumber: 1, isManual: false });
        expect(storage.pageBoundaries[1]).toEqual({ pos: charOffset, pageNumber: 2, isManual: false });
    });

    it("keeps character, parenthetical, and dialogue together across page boundaries", () => {
        // fill page to 54 lines (27 actions * 2 lines = 54 lines)
        const nodes: Array<{ type: string; text?: string; breaks?: number; offset: number }> = [];
        let offset = 0;
        for (let i = 0; i < 27; i++) {
            nodes.push({ type: "action", text: `Action block ${i}`, offset });
            offset += 30;
        }

        const charOffset = offset;
        nodes.push({ type: "character", text: "SARAH", offset: charOffset });
        offset += 20;

        const parenOffset = offset;
        nodes.push({ type: "parenthetical", text: "(whispering softly)", offset: parenOffset });
        offset += 25;

        const dialOffset = offset;
        nodes.push({ type: "dialogue", text: "Listen carefully to what I am saying.", offset: dialOffset });

        const doc = createMockDoc(nodes);
        const storage: PaginationStorage = {
            totalPages: 1,
            currentPage: 1,
            scenePages: {},
            pageBoundaries: []
        };

        computePagination(doc, storage);

        // break must be before character (charOffset), keeping character + parenthetical + dialogue together
        expect(storage.pageBoundaries[1]?.pos).toBe(charOffset);
        expect(storage.pageBoundaries[1]?.pageNumber).toBe(2);
    });

    it("never breaks between character cue and dialogue even if dialogue is long", () => {
        // character cue followed by 60 lines of dialogue starting at document beginning
        const doc = createMockDoc([
            { type: "character", text: "MONOLOGUE MAN", offset: 0 },
            { type: "dialogue", text: "a".repeat(35 * 60), offset: 30 }
        ]);

        const storage: PaginationStorage = {
            totalPages: 1,
            currentPage: 1,
            scenePages: {},
            pageBoundaries: []
        };

        computePagination(doc, storage);

        // must start on page 1 together, not break before dialogue at offset 30
        const breakAtDialogue = storage.pageBoundaries.find((b) => b.pos === 30);
        expect(breakAtDialogue).toBeUndefined();
    });
});

describe("Version History formatRelativeTime", () => {
    it("formats recent timestamps into clean relative strings", async () => {
        const { formatRelativeTime } = await import("../../components/VersionHistoryDrawer");

        // empty / fallback
        expect(formatRelativeTime(undefined, "04:15 PM")).toBe("04:15 PM");

        // less than 45 seconds ago
        const justNow = new Date(Date.now() - 10 * 1000).toISOString();
        expect(formatRelativeTime(justNow)).toBe("Just now");

        // 10 minutes ago
        const tenMins = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        expect(formatRelativeTime(tenMins)).toBe("10m ago");
    });
});
