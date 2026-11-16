import { Role, type UserDto } from "@platform/contracts";
import { describe, expect, it } from "vitest";
import { isVisible } from "@/Components/Layout/AppSidebar";
import { navigationGroups } from "@/Components/Layout/Navigation";

function mockUser(role: Role): UserDto {
    return {
        id: "5d208b4b-e013-4244-86a2-077de8803350",
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

describe("b18 reproducer: screenplay studio navigation rbac", () => {
    const scriptItem = navigationGroups.flatMap((group) => group.items).find((item) => item.href === "/studio/script")!;

    it("verifies script item is present in navigation definitions", () => {
        expect(scriptItem).toBeDefined();
        expect(scriptItem.minimumRole).toBe(Role.Admin);
    });

    it("allows administrators to access screenplay studio", () => {
        // admins and super admins have legitimate access
        expect(isVisible(scriptItem, mockUser(Role.Admin), false)).toBe(true);
        expect(isVisible(scriptItem, mockUser(Role.SuperAdmin), false)).toBe(true);
    });

    it("hides screenplay studio from uninvited non-admins", () => {
        // baseline check without invitations
        expect(isVisible(scriptItem, mockUser(Role.Supervisor), false)).toBe(false);
        expect(isVisible(scriptItem, mockUser(Role.Contributor), false)).toBe(false);
        expect(isVisible(scriptItem, mockUser(Role.Member), false)).toBe(false);
    });

    it("demonstrates b18 leak: invited non-admins gain screenplay studio access", () => {
        // screenplay studio invariants strictly restrict access to admin and super_admin
        // current implementation in AppSidebar.tsx lines 53-56 returns hasStudioAccess || hasAtLeast(user, Role.Admin)
        // when a non-admin receives an invite session (hasStudioAccess = true), isVisible erroneously returns true
        const supervisor = mockUser(Role.Supervisor);
        const contributor = mockUser(Role.Contributor);
        const member = mockUser(Role.Member);

        // expected invariant: non-admins must never see screenplay studio even if invited
        // failing assertion against current code: isVisible returns true instead of false
        expect(isVisible(scriptItem, supervisor, true)).toBe(false);
        expect(isVisible(scriptItem, contributor, true)).toBe(false);
        expect(isVisible(scriptItem, member, true)).toBe(false);
    });
});
