import { Role, type UserDto } from "@platform/contracts";

const roleRanks: Readonly<Record<Role, number>> = {
    [Role.Voter]: 1,
    [Role.Contributor]: 2,
    [Role.SeniorContributor]: 3,
    [Role.Moderator]: 4,
    [Role.Supervisor]: 5,
    [Role.Admin]: 6
};

export const roleLabels: Readonly<Record<Role, string>> = {
    [Role.Voter]: "Voter",
    [Role.Contributor]: "Contributor",
    [Role.SeniorContributor]: "Senior contributor",
    [Role.Moderator]: "Moderator",
    [Role.Supervisor]: "Supervisor",
    [Role.Admin]: "Admin"
};

export const rolesByRank: readonly Role[] = Object.values(Role).sort((left, right) => roleRanks[left] - roleRanks[right]);

export function hasAtLeast(user: UserDto | null | undefined, required: Role): boolean {
    return user !== null && user !== undefined && roleRanks[user.role] >= roleRanks[required];
}

export function outranks(role: Role, other: Role): boolean {
    return roleRanks[role] > roleRanks[other];
}
