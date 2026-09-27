import { fieldRules, problemOf, textLimits, validateRoundWindow } from "@platform/contracts";
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

describe("round schedule validation", () => {
    const baseNow = new Date("2026-09-28T12:00:00.000Z");

    it("allows unscheduled rounds with null dates", () => {
        expect(validateRoundWindow(null, null, { isDraft: true, now: baseNow })).toBeNull();
        expect(validateRoundWindow(null, null, { isDraft: false, now: baseNow })).toBeNull();
    });

    it("requires both dates when one is set", () => {
        expect(validateRoundWindow(baseNow, null, { isDraft: true, now: baseNow })).toBe("Scheduled rounds must have a closing time.");
        expect(validateRoundWindow(null, baseNow, { isDraft: true, now: baseNow })).toBe("Scheduled rounds must have an opening time.");
    });

    it("guards draft window boundaries", () => {
        const wayInPast = new Date(baseNow.getTime() - 10 * 60_000);
        const nearPast = new Date(baseNow.getTime() - 2 * 60_000);
        const close2h = new Date(baseNow.getTime() + 2 * 3_600_000);

        expect(validateRoundWindow(wayInPast, close2h, { isDraft: true, now: baseNow })).toBe(
            "Start date cannot be more than 5 minutes in the past."
        );
        expect(validateRoundWindow(nearPast, close2h, { isDraft: true, now: baseNow })).toBeNull();

        const tooFarAhead = new Date(baseNow.getTime() + 30 * 86_400_000);
        const farClose = new Date(tooFarAhead.getTime() + 2 * 3_600_000);
        expect(validateRoundWindow(tooFarAhead, farClose, { isDraft: true, now: baseNow })).toBe(
            "Start date cannot be more than 28 days in advance."
        );

        const shortClose = new Date(baseNow.getTime() + 30 * 60_000);
        expect(validateRoundWindow(baseNow, shortClose, { isDraft: true, now: baseNow })).toBe(
            "Voting duration must be at least 60 minutes."
        );

        const longClose = new Date(baseNow.getTime() + 35 * 86_400_000);
        expect(validateRoundWindow(baseNow, longClose, { isDraft: true, now: baseNow })).toBe(
            "Voting duration cannot exceed 28 days."
        );
    });

    it("accepts string ISO timestamps isomorphically", () => {
        const openStr = "2026-09-28T12:00:00.000Z";
        const closeStr = "2026-09-28T15:00:00.000Z";
        expect(validateRoundWindow(openStr, closeStr, { isDraft: true, now: baseNow })).toBeNull();
    });

    it("validates extensions on non-draft rounds", () => {
        const opened = new Date(baseNow.getTime() - 24 * 3_600_000);
        const closedInPast = new Date(baseNow.getTime() - 3_600_000);
        expect(validateRoundWindow(opened, closedInPast, { isDraft: false, now: baseNow })).toBe("Closing time cannot be in the past.");

        const closedBeforeOpen = new Date(opened.getTime() - 3_600_000);
        expect(validateRoundWindow(opened, closedBeforeOpen, { isDraft: false, now: baseNow })).toBe("Closing time must be after the start time.");

        const validExtension = new Date(baseNow.getTime() + 48 * 3_600_000);
        expect(validateRoundWindow(opened, validExtension, { isDraft: false, now: baseNow })).toBeNull();
    });
});
