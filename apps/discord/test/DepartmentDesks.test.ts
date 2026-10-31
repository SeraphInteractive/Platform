import { Specialty } from "@platform/contracts";
import type { Role } from "discord.js";
import { describe, expect, it } from "vitest";
import { departmentStaffRoleIds } from "../src/Services/DepartmentDesks.js";

function role(id: string, name: string): Role {
    return { id, name } as Role;
}

describe("department desk staff", () => {
    it("picks the department's own supervisors and project leadership", () => {
        const roles = [
            role("1", "Animation Supervisor"),
            role("2", "Rigging Supervisor"),
            role("3", "Producer"),
            role("4", "Animators"),
            role("5", "Members"),
            role("6", "Some Bot Role")
        ];
        expect(departmentStaffRoleIds({ supervisorSpecialties: [Specialty.AnimationSupervisor] }, roles)).toEqual(["1", "3"]);
    });
});
