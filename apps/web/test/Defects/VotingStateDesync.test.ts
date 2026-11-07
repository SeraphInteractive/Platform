import { EntryStatus, Role, type EntryDto, type UserDto } from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { hasSubmittedEntry, isEligible } from "@/Features/Voting/UseApprovedEntries";

function mockUser(id: string, role: Role): UserDto {
    return {
        id,
        discordId: "200000000000000001",
        username: "testuser",
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

function mockEntry(id: string, roundId: string, submittedBy: string, status: EntryStatus): EntryDto {
    return {
        id,
        roundId,
        title: "Test Submission",
        description: "Test Pitch",
        status,
        submittedBy,
        isQuarantined: false,
        mediaUrl: null,
        aiFlags: [],
        author: null,
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z"
    };
}

describe("b19 reproducer: voting state desync and duplicate submission trap", () => {
    const roundId = "5d208b4b-e013-4244-86a2-077de8803350";
    const member = mockUser("5d208b4b-e013-4244-86a2-077de8803351", Role.Member);
    const admin = mockUser("5d208b4b-e013-4244-86a2-077de8803352", Role.Admin);

    it("verifies eligibility filter properly excludes pending review entries from voting ballot", () => {
        const pending = mockEntry("5d208b4b-e013-4244-86a2-077de8803353", roundId, member.id, EntryStatus.PendingReview);
        const approved = mockEntry(
            "5d208b4b-e013-4244-86a2-077de8803354",
            roundId,
            "5d208b4b-e013-4244-86a2-077de8803355",
            EntryStatus.Approved
        );

        // only approved and unquarantined entries are eligible for the voting ballot
        expect(isEligible(approved)).toBe(true);
        expect(isEligible(pending)).toBe(false);
    });

    it("detects submission for user with an already approved entry", () => {
        const approvedEntries: EntryDto[] = [mockEntry("5d208b4b-e013-4244-86a2-077de8803354", roundId, member.id, EntryStatus.Approved)];
        const hasAlreadySubmitted = hasSubmittedEntry(member, roundId, approvedEntries, []);
        expect(hasAlreadySubmitted).toBe(true);
    });

    it("allows administrators to submit multiple entries", () => {
        const approvedEntries: EntryDto[] = [mockEntry("5d208b4b-e013-4244-86a2-077de8803356", roundId, admin.id, EntryStatus.Approved)];
        const hasAlreadySubmitted = hasSubmittedEntry(admin, roundId, approvedEntries, []);
        expect(hasAlreadySubmitted).toBe(false);
    });

    it("demonstrates b19 defect: hasAlreadySubmitted misses pending review submissions", () => {
        const userPendingEntry = mockEntry("5d208b4b-e013-4244-86a2-077de8803353", roundId, member.id, EntryStatus.PendingReview);

        const allRoundEntries: EntryDto[] = [
            userPendingEntry,
            mockEntry("5d208b4b-e013-4244-86a2-077de8803355", roundId, "5d208b4b-e013-4244-86a2-077de8803357", EntryStatus.Approved)
        ];
        const approvedEntries = allRoundEntries.filter((e) => e.status === EntryStatus.Approved);

        // evaluate submission status using hasSubmittedEntry helper
        const hasAlreadySubmitted = hasSubmittedEntry(member, roundId, approvedEntries, [userPendingEntry]);
        expect(hasAlreadySubmitted).toBe(true);
    });
});
