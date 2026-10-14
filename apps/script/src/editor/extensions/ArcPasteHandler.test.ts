import { describe, it, expect } from "vitest";
import { parseArcStudioHtml, parseScreenplayPlainText } from "./ArcPasteHandler";

describe("ArcPasteHandler", () => {
    it("parses screenplay plaintext with scene numbers, dialogue, and page breaks", () => {
        const scriptText = `
5  PLATFORM DASHBOARD - ENTRY SUBMISSION SNEAK PEEK  5

Fast screen capture B-roll:

MATT (V.O.)
(leaning in)
Now, making a movie with thousands of contributors does sound chaotic.

CUT TO:

===

6  INT. WORKSHOP - NIGHT
A dim workshop glows.
`;
        const nodes = parseScreenplayPlainText(scriptText);
        expect(nodes).toBeTruthy();
        expect(nodes?.length).toBe(9);

        // 1. scene heading with scene number
        expect(nodes?.[0]?.type).toBe("sceneHeading");
        expect(nodes?.[0]?.attrs?.sceneNumber).toBe("5");
        expect(nodes?.[0]?.content?.[0]?.text).toContain("PLATFORM DASHBOARD");

        // 2. action
        expect(nodes?.[1]?.type).toBe("action");
        expect(nodes?.[1]?.content?.[0]?.text).toBe("Fast screen capture B-roll:");

        // 3. character
        expect(nodes?.[2]?.type).toBe("character");
        expect(nodes?.[2]?.content?.[0]?.text).toBe("MATT (V.O.)");

        // 4. parenthetical
        expect(nodes?.[3]?.type).toBe("parenthetical");
        expect(nodes?.[3]?.content?.[0]?.text).toBe("(leaning in)");

        // 5. dialogue
        expect(nodes?.[4]?.type).toBe("dialogue");
        expect(nodes?.[4]?.content?.[0]?.text).toBe("Now, making a movie with thousands of contributors does sound chaotic.");

        // 6. transition
        expect(nodes?.[5]?.type).toBe("transition");
        expect(nodes?.[5]?.content?.[0]?.text).toBe("CUT TO:");

        // 7. page break
        expect(nodes?.[6]?.type).toBe("pageBreak");

        // 8. next scene heading
        expect(nodes?.[7]?.type).toBe("sceneHeading");
        expect(nodes?.[7]?.attrs?.sceneNumber).toBe("6");
    });

    it("parses Arc Studio HTML with paragraph-scene, scene number, and dialogue", () => {
        const arcHtml = `
<div class="page-section">
  <div class="paragraph-content paragraph-scene">
    <div class="paragraph-scene-number">5</div>
    <div class="paragraph-text"><span class="paragraph-fragment">PLATFORM DASHBOARD - ENTRY SUBMISSION SNEAK PEEK</span></div>
  </div>
</div>
<div class="page-section">
  <div class="paragraph-content paragraph-character">
    <div class="paragraph-text"><span class="paragraph-fragment">MATT (V.O.)</span></div>
  </div>
</div>
<div class="page-section">
  <div class="paragraph-content paragraph-dialogue">
    <div class="paragraph-text"><span class="paragraph-fragment">We thought ahead!</span></div>
  </div>
</div>
`;
        const nodes = parseArcStudioHtml(arcHtml);
        if (nodes) {
            expect(nodes.length).toBe(3);
            expect(nodes[0]?.type).toBe("sceneHeading");
            expect(nodes[0]?.attrs?.sceneNumber).toBe("5");
            expect(nodes[1]?.type).toBe("character");
            expect(nodes[2]?.type).toBe("dialogue");
            expect(nodes[2]?.content?.[0]?.text).toBe("We thought ahead!");
        }
    });
});
