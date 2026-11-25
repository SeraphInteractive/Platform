import { allowedSpecialtiesForRole, maximumTotalSpecialties, rankOfRole, Role, type Specialty } from "@platform/contracts";

export {
    adminSpecialties,
    allowedSpecialtiesForRole,
    assignableSpecialties,
    contributorSpecialties,
    exclusiveSpecialties,
    maximumSpecialties,
    maximumTotalSpecialties,
    Role,
    roleRanks,
    selfSelectableSpecialties,
    Specialty,
    specialtyLabel,
    supervisorGrantableSpecialties,
    supervisorSpecialties,
    teamSpecialties
} from "@platform/contracts";

export const rankOf = rankOfRole;

export const maximumSuperAdmins = 2;

export function settleRole(role: Role, isVerified: boolean, currentRole: Role | null): Role {
    if (role === Role.Voter && !isVerified && currentRole !== Role.Voter) {
        return Role.Member;
    }
    return role;
}

export function isGrantable(role: Role): boolean {
    return role !== Role.SuperAdmin;
}

export function hasAtLeast(role: Role, required: Role): boolean {
    return rankOf(role) >= rankOf(required);
}

export function isHigherThan(role: Role, other: Role): boolean {
    return rankOf(role) > rankOf(other);
}

export function canHoldSpecialties(role: Role): boolean {
    return role !== Role.Voter && role !== Role.Member;
}

export function normalizeSpecialties(role: Role, specialties: readonly Specialty[]): Specialty[] {
    const allowed = allowedSpecialtiesForRole(role);
    if (allowed.length === 0) {
        return [];
    }
    const filtered = specialties.filter((s) => allowed.includes(s));
    return [...new Set(filtered)].slice(0, maximumTotalSpecialties);
}
