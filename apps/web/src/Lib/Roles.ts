import { Role, type UserDto } from "@platform/contracts";

const roleRanks: Readonly<Record<Role, number>> = {
    [Role.Member]: 0,
    [Role.Voter]: 1,
    [Role.Contributor]: 2,
    [Role.SeniorContributor]: 3,
    [Role.Moderator]: 4,
    [Role.Supervisor]: 4,
    [Role.Admin]: 5,
    [Role.SuperAdmin]: 6
};

export const roleLabels: Readonly<Record<Role, string>> = {
    [Role.Member]: "Member",
    [Role.Voter]: "Voter",
    [Role.Contributor]: "Contributor",
    [Role.SeniorContributor]: "Contributor",
    [Role.Moderator]: "Supervisor",
    [Role.Supervisor]: "Supervisor",
    [Role.Admin]: "Admin",
    [Role.SuperAdmin]: "Super admin"
};

export const rolesByRank: readonly Role[] = [Role.Member, Role.Voter, Role.Contributor, Role.Supervisor, Role.Admin, Role.SuperAdmin];

export function isGrantable(role: Role): boolean {
    return role !== Role.SuperAdmin;
}

export function hasAtLeast(user: UserDto | null | undefined, required: Role): boolean {
    return user !== null && user !== undefined && roleRanks[user.role] >= roleRanks[required];
}

export function outranks(role: Role, other: Role): boolean {
    return roleRanks[role] > roleRanks[other];
}
