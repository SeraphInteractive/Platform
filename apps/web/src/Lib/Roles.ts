import { Role, type UserDto } from "@platform/contracts";

const roleRanks: Readonly<Record<Role, number>> = {
    [Role.Member]: 0,
    [Role.Voter]: 1,
    [Role.Contributor]: 2,
    [Role.SeniorContributor]: 3,
    [Role.Moderator]: 4,
    [Role.Supervisor]: 5,
    [Role.Admin]: 6,
    [Role.SuperAdmin]: 7
};

export const roleLabels: Readonly<Record<Role, string>> = {
    [Role.Member]: "Member",
    [Role.Voter]: "Voter",
    [Role.Contributor]: "Contributor",
    [Role.SeniorContributor]: "Senior contributor",
    [Role.Moderator]: "Moderator",
    [Role.Supervisor]: "Supervisor",
    [Role.Admin]: "Admin",
    [Role.SuperAdmin]: "Super admin"
};

export const rolesByRank: readonly Role[] = Object.values(Role).sort((left, right) => roleRanks[left] - roleRanks[right]);

export function isGrantable(role: Role): boolean {
    return role !== Role.SuperAdmin;
}

export function hasAtLeast(user: UserDto | null | undefined, required: Role): boolean {
    return user !== null && user !== undefined && roleRanks[user.role] >= roleRanks[required];
}

export function outranks(role: Role, other: Role): boolean {
    return roleRanks[role] > roleRanks[other];
}
