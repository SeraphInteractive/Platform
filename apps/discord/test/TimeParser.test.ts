import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { parseReminderTime } from "../src/Common/TimeParser.js";

describe("parseReminderTime", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("parses minutes", () => {
        const result = parseReminderTime("30m");
        expect(result.getTime()).toBe(new Date("2025-06-15T12:30:00Z").getTime());
    });

    it("parses hours", () => {
        const result = parseReminderTime("2h");
        expect(result.getTime()).toBe(new Date("2025-06-15T14:00:00Z").getTime());
    });

    it("parses days", () => {
        const result = parseReminderTime("1d");
        expect(result.getTime()).toBe(new Date("2025-06-16T12:00:00Z").getTime());
    });

    it("parses weeks", () => {
        const result = parseReminderTime("1w");
        expect(result.getTime()).toBe(new Date("2025-06-22T12:00:00Z").getTime());
    });

    it("parses combined durations", () => {
        const result = parseReminderTime("1d12h");
        expect(result.getTime()).toBe(new Date("2025-06-17T00:00:00Z").getTime());
    });

    it("parses with spaces", () => {
        const result = parseReminderTime("1d 6h 30m");
        expect(result.getTime()).toBe(new Date("2025-06-16T18:30:00Z").getTime());
    });

    it("is case insensitive", () => {
        const result = parseReminderTime("2H");
        expect(result.getTime()).toBe(new Date("2025-06-15T14:00:00Z").getTime());
    });

    it("parses absolute timestamps", () => {
        const result = parseReminderTime("2025-07-01 14:00");
        expect(result.toISOString()).toBe("2025-07-01T14:00:00.000Z");
    });

    it("rejects durations under 1 minute", () => {
        expect(() => parseReminderTime("30s")).toThrow("at least 1 minute");
    });

    it("rejects durations over 90 days", () => {
        expect(() => parseReminderTime("100d")).toThrow("at most 90 days");
    });

    it("rejects garbage input", () => {
        expect(() => parseReminderTime("next tuesday")).toThrow("Couldn't parse");
    });

    it("rejects past absolute timestamps", () => {
        expect(() => parseReminderTime("2020-01-01 00:00")).toThrow("past");
    });
});
