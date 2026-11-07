import { describe, it, expect } from "vitest";
import { canAccessScript, checkUserAuthorized, type ScriptUserProfile } from "../../components/AccessGuard";

describe("Studio RBAC and Script Access", () => {
    const adminUser: ScriptUserProfile = {
        id: "admin-1",
        username: "root_admin",
        role: "admin",
        isInvited: false,
        invitedScriptIds: []
    };

    const superAdminUser: ScriptUserProfile = {
        id: "superadmin-1",
        username: "site_owner",
        role: "super_admin",
        isInvited: false,
        invitedScriptIds: []
    };

    const memberInvitedToScriptA: ScriptUserProfile = {
        id: "user-2",
        username: "invited_writer",
        role: "member",
        isInvited: true,
        invitedScriptIds: ["script-a"]
    };

    const memberInvitedWildcard: ScriptUserProfile = {
        id: "user-3",
        username: "wildcard_writer",
        role: "member",
        isInvited: true,
        invitedScriptIds: ["*"]
    };

    const uninvitedMember: ScriptUserProfile = {
        id: "user-4",
        username: "regular_user",
        role: "member",
        isInvited: false,
        invitedScriptIds: []
    };

    it("authorizes admins and invited members for studio entry", () => {
        expect(checkUserAuthorized(adminUser)).toBe(true);
        expect(checkUserAuthorized(superAdminUser)).toBe(true);
        expect(checkUserAuthorized(memberInvitedToScriptA)).toBe(true);
        expect(checkUserAuthorized(uninvitedMember)).toBe(false);
    });

    it("grants administrators access to all individual scripts", () => {
        expect(canAccessScript(adminUser, "script-a")).toBe(true);
        expect(canAccessScript(adminUser, "script-b")).toBe(true);
        expect(canAccessScript(superAdminUser, "any-script-id")).toBe(true);
    });

    it("restricts invited members strictly to their invited script ids", () => {
        // permitted to script-a
        expect(canAccessScript(memberInvitedToScriptA, "script-a")).toBe(true);
        // blocked from script-b
        expect(canAccessScript(memberInvitedToScriptA, "script-b")).toBe(false);
        // uninvited user blocked from any script
        expect(canAccessScript(uninvitedMember, "script-a")).toBe(false);
        // wildcard invite allows all scripts
        expect(canAccessScript(memberInvitedWildcard, "script-x")).toBe(true);
    });

    it("handles null or undefined user safely", () => {
        expect(canAccessScript(null, "script-a")).toBe(false);
    });
});
