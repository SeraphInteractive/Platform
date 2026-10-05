import { Role, Specialty, type UserDto } from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { buildQuery } from "@/Api/ApiClient";
import {
    formatBytes,
    formatDate,
    formatDateTime,
    formatPercent,
    fromLocalInputValue,
    specialtyLabel,
    toLocalInputValue
} from "@/Lib/Format";
import { pipelineSteps, progressPercentFor } from "@/Lib/Pipeline";
import { insertPickAt, movePick, samePicks, togglePick } from "@/Lib/Ranking";
import { hasAtLeast, outranks, rolesByRank } from "@/Lib/Roles";

function user(role: Role): UserDto {
    return {
        id: "5d208b4b-e013-4244-86a2-077de8803350",
        discordId: "200000000000000001",
        username: "someone",
        avatarUrl: null,
        role,
        specialties: [],
        isBlacklisted: false,
        isOnboarded: true,
        termsVersion: null,
        isVerified: true,
        createdAt: "2026-09-27T00:00:00.000Z"
    };
}

describe("ballot ranking", () => {
    it("adds picks until the ballot is full", () => {
        expect(togglePick([], "a", 3)).toEqual(["a"]);
        expect(togglePick(["a", "b"], "c", 3)).toEqual(["a", "b", "c"]);
        expect(togglePick(["a", "b", "c"], "d", 3)).toEqual(["a", "b", "c"]);
    });

    it("removes a pick that is toggled again", () => {
        expect(togglePick(["a", "b", "c"], "b", 3)).toEqual(["a", "c"]);
    });

    it("replaces the single pick in binary polls", () => {
        expect(togglePick(["a"], "b", 1)).toEqual(["b"]);
        expect(togglePick(["a"], "a", 1)).toEqual([]);
    });

    it("reorders picks within bounds", () => {
        expect(movePick(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
        expect(movePick(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
        expect(movePick(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
        expect(movePick(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
        expect(movePick(["a"], 5, -1)).toEqual(["a"]);
    });

    it("inserts and shifts picks on drop", () => {
        expect(insertPickAt(["a", "b", "c"], "d", 0, 3)).toEqual(["d", "a", "b"]);
        expect(insertPickAt(["a", "b", "c"], "d", 1, 3)).toEqual(["a", "d", "b"]);
        expect(insertPickAt(["a", "b", "c"], "b", 0, 3)).toEqual(["b", "a", "c"]);
        expect(insertPickAt(["a", "b", "c"], "a", 2, 3)).toEqual(["b", "c", "a"]);
        expect(insertPickAt([], "a", 2, 3)).toEqual(["a"]);
    });

    it("never mutates its input", () => {
        const picks = Object.freeze(["a", "b"]);
        expect(() => togglePick(picks, "c", 3)).not.toThrow();
        expect(() => movePick(picks, 1, -1)).not.toThrow();
        expect(() => insertPickAt(picks, "c", 0, 3)).not.toThrow();
    });

    it("compares saved ballots by order", () => {
        expect(samePicks(["a", "b"], ["a", "b"])).toBe(true);
        expect(samePicks(["a", "b"], ["b", "a"])).toBe(false);
        expect(samePicks(null, [])).toBe(false);
    });
});

describe("roles", () => {
    it("orders roles from voter to super admin", () => {
        expect(rolesByRank[0]).toBe(Role.Member);
        expect(rolesByRank.at(-1)).toBe(Role.SuperAdmin);
    });

    it("checks minimum roles", () => {
        expect(hasAtLeast(user(Role.Supervisor), Role.Moderator)).toBe(true);
        expect(hasAtLeast(user(Role.Contributor), Role.Moderator)).toBe(false);
        expect(hasAtLeast(null, Role.Voter)).toBe(false);
    });

    it("compares ranks strictly", () => {
        expect(outranks(Role.Admin, Role.Supervisor)).toBe(true);
        expect(outranks(Role.Supervisor, Role.Supervisor)).toBe(false);
    });
});

describe("formatting", () => {
    it("formats sizes and percentages", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
        expect(formatPercent(62.456)).toBe("62.5%");
    });

    it("round-trips datetime-local values", () => {
        const iso = "2026-10-01T18:30:00.000Z";
        expect(fromLocalInputValue(toLocalInputValue(iso))).toBe(iso);
        expect(fromLocalInputValue("")).toBeNull();
        expect(fromLocalInputValue("garbage")).toBeNull();
        expect(toLocalInputValue(null)).toBe("");
    });

    it("labels specialties", () => {
        expect(specialtyLabel(Specialty.Modeler3d)).toBe("3D Modeler");
        expect(specialtyLabel(Specialty.CfxVfxSupervisor)).toBe("Cfx Vfx Supervisor");
    });
});

describe("query strings", () => {
    it("drops empty values and encodes the rest", () => {
        expect(buildQuery(undefined)).toBe("");
        expect(buildQuery({ page: 1, status: undefined, role: null, q: "" })).toBe("?page=1");
        expect(buildQuery({ q: "a&b=c" })).toBe("?q=a%26b%3Dc");
    });
});

describe("pipeline", () => {
    it("has unique, ordered step ids", () => {
        const ids = pipelineSteps.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(pipelineSteps.every((step, index) => step.index === index)).toBe(true);
    });

    it("matches the API default for the first step and ends at 100%", () => {
        expect(progressPercentFor(0)).toBe(3);
        expect(progressPercentFor(pipelineSteps.length - 1)).toBe(100);
    });
});

describe("date formatting", () => {
    const now = new Date(2026, 8, 27, 12, 0);

    it("names nearby days", () => {
        expect(formatDateTime(new Date(2026, 8, 27, 9, 5).toISOString(), now)).toBe("Today, 09:05");
        expect(formatDateTime(new Date(2026, 8, 28, 18, 30).toISOString(), now)).toBe("Tomorrow, 18:30");
    });

    it("drops the year within the current year", () => {
        expect(formatDateTime(new Date(2026, 9, 3, 14, 0).toISOString(), now)).toBe("Sat 3 Oct, 14:00");
        expect(formatDateTime(new Date(2025, 0, 5, 8, 0).toISOString(), now)).toBe("5 Jan 2025, 08:00");
    });

    it("formats plain dates", () => {
        expect(formatDate(new Date(2026, 8, 27).toISOString())).toBe("27 Sept 2026");
        expect(formatDate(null)).toBe("Not set");
    });
});
