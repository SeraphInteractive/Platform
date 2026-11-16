import { Role, roleLabel, roleLabels, type UserDto } from "@platform/contracts";

export { roleLabel, roleLabels };

const roleRanks: Readonly<Record<Role, number>> = {
    [Role.Member]: 0,
    [Role.Voter]: 1,
    [Role.Contributor]: 2,
    [Role.SeniorContributor]: 3,
    [Role.Supervisor]: 4,
    [Role.Admin]: 5,
    [Role.SuperAdmin]: 6
};

export const rolesByRank: readonly Role[] = [
    Role.Member,
    Role.Voter,
    Role.Contributor,
    Role.SeniorContributor,
    Role.Supervisor,
    Role.Admin,
    Role.SuperAdmin
];

export function isGrantable(role: Role): boolean {
    return role !== Role.SuperAdmin;
}

export function hasAtLeast(subject: UserDto | Role | null | undefined, required: Role): boolean {
    if (subject === null || subject === undefined) {
        return false;
    }
    const role = typeof subject === "string" ? subject : subject.role;
    return roleRanks[role] >= roleRanks[required];
}

export function outranks(role: Role, other: Role): boolean {
    return roleRanks[role] > roleRanks[other];
}
