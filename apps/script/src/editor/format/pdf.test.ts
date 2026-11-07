import { describe, it, expect } from "vitest";
import { exportToPdf } from "./pdf";
import type { JSONContent } from "@tiptap/react";

describe("Screenplay PDF Exporter", () => {
    const sampleDoc: JSONContent = {
        type: "doc",
        content: [
            {
                type: "sceneHeading",
                content: [{ type: "text", text: "INT. WORKSHOP - NIGHT" }]
            },
            {
                type: "action",
                content: [{ type: "text", text: "The fluorescent tubes flicker above the work bench." }]
            },
            {
                type: "character",
                content: [{ type: "text", text: "MARCUS" }]
            },
            {
                type: "parenthetical",
                content: [{ type: "text", text: "(whispering)" }]
            },
            {
                type: "dialogue",
                content: [{ type: "text", text: "Is the render queue finished?" }]
            },
            {
                type: "transition",
                content: [{ type: "text", text: "CUT TO:" }]
            }
        ]
    };

    it("generates a valid PDF with correct magic header bytes", () => {
        const result = exportToPdf(sampleDoc, "Episode 1");
        expect(result.bytes).toBeDefined();
        expect(result.bytes.length).toBeGreaterThan(100);

        // check %PDF- magic signature
        const header = new TextDecoder().decode(result.bytes.slice(0, 5));
        expect(header).toBe("%PDF-");
        expect(result.totalPages).toBe(1);
    });

    it("creates a separate title page when title page data is present", () => {
        const titlePageData = {
            title: "Project Stairway",
            author: "Director",
            contact: "contact@projectstairway.net"
        };

        const result = exportToPdf(sampleDoc, "Project Stairway", titlePageData, { includeTitlePage: true });
        // sheet 1 is title page, sheet 2 is script page 1
        expect(result.totalPages).toBe(1); // 1 script page
        const header = new TextDecoder().decode(result.bytes.slice(0, 5));
        expect(header).toBe("%PDF-");
    });

    it("handles explicit page breaks and advances total pages", () => {
        const multiPageDoc: JSONContent = {
            type: "doc",
            content: [
                {
                    type: "sceneHeading",
                    content: [{ type: "text", text: "INT. WORKSHOP - NIGHT" }]
                },
                {
                    type: "pageBreak"
                },
                {
                    type: "sceneHeading",
                    content: [{ type: "text", text: "EXT. CITY STREET - DAY" }]
                }
            ]
        };

        const result = exportToPdf(multiPageDoc, "Multi-page Test");
        expect(result.totalPages).toBe(2);
    });
});
