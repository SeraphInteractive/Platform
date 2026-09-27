import { fieldRules, problemOf, textLimits } from "@platform/contracts";
import { describe, expect, it } from "vitest";

describe("shared text rules", () => {
    it("cleans single-line text before measuring it", () => {
        expect(fieldRules.entryTitle.parse("  A​good‮   title\n ")).toBe("Agood title");
        expect(problemOf(fieldRules.entryTitle, "   ​ ")).toBe("Title is required.");
    });

    it("enforces short title limits", () => {
        expect(problemOf(fieldRules.entryTitle, "a".repeat(textLimits.entryTitle))).toBeNull();
        expect(problemOf(fieldRules.entryTitle, "a".repeat(textLimits.entryTitle + 1))).toBe(
            `Title must be ${textLimits.entryTitle} characters or fewer.`
        );
        expect(problemOf(fieldRules.documentTitle, "a".repeat(textLimits.documentTitle + 1))).not.toBeNull();
    });

    it("keeps paragraphs in multi-line text but drops control characters", () => {
        expect(fieldRules.entryDescription.parse("one\r\n\r\n\r\n\r\ntwo\u0007  ")).toBe("one\n\ntwo");
        expect(fieldRules.entryDescription.parse("   ")).toBeNull();
        expect(fieldRules.entryDescription.parse(null)).toBeNull();
    });

    it("restricts shot codes to a safe alphabet", () => {
        expect(problemOf(fieldRules.shotCode, "SC-010.a_1")).toBeNull();
        expect(problemOf(fieldRules.shotCode, "sc 010")).not.toBeNull();
        expect(problemOf(fieldRules.shotCode, "<b>")).not.toBeNull();
    });
});
