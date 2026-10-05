import { maximumSpecialties, Role, type Specialty } from "@platform/contracts";

export { maximumSpecialties, Role, Specialty } from "@platform/contracts";

const roleRanks: Readonly<Record<Role, number>> = Object.freeze({
    [Role.Voter]: 1,
    [Role.Contributor]: 2,
    [Role.SeniorContributor]: 3,
    [Role.Moderator]: 4,
    [Role.Supervisor]: 5,
    [Role.Admin]: 6
});

const specialtyRoles: ReadonlySet<Role> = new Set([Role.Contributor, Role.SeniorContributor, Role.Supervisor]);

export function rankOf(role: Role): number {
    return roleRanks[role];
}

export function hasAtLeast(role: Role, required: Role): boolean {
    return rankOf(role) >= rankOf(required);
}

export function isHigherThan(role: Role, other: Role): boolean {
    return rankOf(role) > rankOf(other);
}

export function canHoldSpecialties(role: Role): boolean {
    return specialtyRoles.has(role);
}

export function normalizeSpecialties(role: Role, specialties: readonly Specialty[]): Specialty[] {
    if (!canHoldSpecialties(role)) {
        return [];
    }
    return [...new Set(specialties)].slice(0, maximumSpecialties);
}
