import { Role, Specialty } from "@platform/contracts";
import { type GuildMember, PermissionFlagsBits } from "discord.js";

export enum StudioTier {
    Executive = 0,
    Department = 1,
    Contributor = 2,
    Community = 3
}

export interface StudioRole {
    readonly name: string;
    readonly tier: StudioTier;
    readonly color: number;
    readonly specialty?: Specialty;
}

export const memberPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseApplicationCommands
];

export const voterPermissions = [
    ...memberPermissions,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.UseExternalEmojis,
    PermissionFlagsBits.UseExternalStickers
];

export const contributorPermissions = [
    ...voterPermissions,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads
];

export const departmentPermissions = [
    ...contributorPermissions,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ViewAuditLog
];

export const communityPermissions = memberPermissions;

export const studioRoles: readonly StudioRole[] = Object.freeze([
    { name: "Producer", tier: StudioTier.Executive, color: 0xe74c3c, specialty: Specialty.Producer },
    { name: "Creative Director", tier: StudioTier.Executive, color: 0x9b59b6, specialty: Specialty.CreativeDirector },
    { name: "Production Manager", tier: StudioTier.Executive, color: 0xc0392b, specialty: Specialty.ProductionManager },
    { name: "Admin", tier: StudioTier.Executive, color: 0x992d22 },
    { name: "Technical Director", tier: StudioTier.Department, color: 0x3498db, specialty: Specialty.TechnicalDirector },
    { name: "Art Director", tier: StudioTier.Department, color: 0xe67e22, specialty: Specialty.ArtDirector },
    { name: "Editorial Supervisor", tier: StudioTier.Department, color: 0x8e44ad, specialty: Specialty.EditorialSupervisor },
    { name: "Layout / Previs Lead", tier: StudioTier.Department, color: 0x9c27b0, specialty: Specialty.LayoutPrevisLead },
    { name: "Modelling Supervisor", tier: StudioTier.Department, color: 0x1abc9c, specialty: Specialty.ModellingSupervisor },
    { name: "Rigging Supervisor", tier: StudioTier.Department, color: 0x2ecc71, specialty: Specialty.RiggingSupervisor },
    { name: "Surfacing / LookDev Lead", tier: StudioTier.Department, color: 0x16a085, specialty: Specialty.SurfacingLookDevLead },
    { name: "Animation Supervisor", tier: StudioTier.Department, color: 0xf39c12, specialty: Specialty.AnimationSupervisor },
    { name: "CFX and VFX Supervisor", tier: StudioTier.Department, color: 0xe91e63, specialty: Specialty.CfxVfxSupervisor },
    {
        name: "Lighting and Compositing Supervisor",
        tier: StudioTier.Department,
        color: 0xf1c40f,
        specialty: Specialty.LightingCompositingSupervisor
    },
    { name: "Sound Director", tier: StudioTier.Department, color: 0x00bcd4, specialty: Specialty.SoundDirector },
    { name: "Supervisor", tier: StudioTier.Department, color: 0x1abc9c },
    { name: "Media Team", tier: StudioTier.Department, color: 0x9b59b6, specialty: Specialty.MediaTeam },
    { name: "Animators", tier: StudioTier.Contributor, color: 0x2980b9, specialty: Specialty.Animator },
    { name: "Layout Artists", tier: StudioTier.Contributor, color: 0x673ab7, specialty: Specialty.LayoutArtist },
    { name: "3D Modelers", tier: StudioTier.Contributor, color: 0x009688, specialty: Specialty.Modeler3d },
    { name: "Riggers", tier: StudioTier.Contributor, color: 0x27ae60, specialty: Specialty.Rigger },
    { name: "Surface / Texture Artists", tier: StudioTier.Contributor, color: 0x20b2aa, specialty: Specialty.SurfaceTextureArtist },
    { name: "Lighting Artists", tier: StudioTier.Contributor, color: 0xd4ac0d, specialty: Specialty.LightingArtist },
    { name: "VFX Artists", tier: StudioTier.Contributor, color: 0xd81b60, specialty: Specialty.VfxArtist },
    { name: "Concept Artists", tier: StudioTier.Contributor, color: 0xd35400, specialty: Specialty.ConceptArtist },
    { name: "Voice Actors", tier: StudioTier.Contributor, color: 0x0097a7, specialty: Specialty.VoiceActor },
    { name: "Sound Designers", tier: StudioTier.Contributor, color: 0x17a2b8, specialty: Specialty.SoundDesigner },
    { name: "Video Editors", tier: StudioTier.Contributor, color: 0x6f42c1, specialty: Specialty.VideoEditor },
    { name: "General Contributors", tier: StudioTier.Contributor, color: 0x3498db },
    { name: "Voters", tier: StudioTier.Community, color: 0x34495e },
    { name: "Members", tier: StudioTier.Community, color: 0x95a5a6 }
]);

export const contributorRoleName = "General Contributors";
export const legacyStudioRoleNames: readonly string[] = Object.freeze(["Observer", "observer", "Unverified", "unverified"]);

export const roleAliases: Readonly<Record<string, string>> = {
    supervisors: "Supervisor",
    supervisor: "Supervisor",
    mediateam: "Media Team",
    mediateams: "Media Team",
    media: "Media Team",
    contributors: "General Contributors",
    contributor: "General Contributors",
    generalcontributors: "General Contributors",
    generalcontributor: "General Contributors",
    voter: "Voters",
    voters: "Voters",
    member: "Members",
    members: "Members",
    animator: "Animators",
    animators: "Animators",
    layoutartist: "Layout Artists",
    layoutartists: "Layout Artists",
    "3dmodeler": "3D Modelers",
    "3dmodelers": "3D Modelers",
    modeler: "3D Modelers",
    modelers: "3D Modelers",
    rigger: "Riggers",
    riggers: "Riggers",
    surfacetextureartist: "Surface / Texture Artists",
    surfacetextureartists: "Surface / Texture Artists",
    lightingartist: "Lighting Artists",
    lightingartists: "Lighting Artists",
    vfxartist: "VFX Artists",
    vfxartists: "VFX Artists",
    conceptartist: "Concept Artists",
    conceptartists: "Concept Artists",
    voiceactor: "Voice Actors",
    voiceactors: "Voice Actors",
    sounddesigner: "Sound Designers",
    sounddesigners: "Sound Designers",
    videoeditor: "Video Editors",
    videoeditors: "Video Editors",
    producer: "Producer",
    producers: "Producer",
    admin: "Admin",
    admins: "Admin"
};

export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

export function findStudioRole(name: string): StudioRole | undefined {
    const normalized = normalizeName(name);
    const alias = roleAliases[normalized];
    if (alias !== undefined) {
        return studioRoles.find((role) => role.name === alias);
    }
    return studioRoles.find((role) => normalizeName(role.name) === normalized);
}

export function isStudioOrLegacyRole(name: string): boolean {
    if (findStudioRole(name) !== undefined) {
        return true;
    }
    const norm = normalizeName(name);
    return legacyStudioRoleNames.some((legacy) => normalizeName(legacy) === norm);
}

export function platformRoleFor(tier: StudioTier): Role {
    switch (tier) {
        case StudioTier.Executive:
            return Role.Admin;
        case StudioTier.Department:
            return Role.Supervisor;
        case StudioTier.Contributor:
            return Role.Contributor;
        case StudioTier.Community:
            return Role.Voter;
    }
}

export function isLeadership(tier: StudioTier): boolean {
    return tier === StudioTier.Executive || tier === StudioTier.Department;
}

export function permissionsForRole(role: StudioRole): readonly bigint[] {
    if (role.name === "Members") {
        return memberPermissions;
    }
    if (role.name === "Voters") {
        return voterPermissions;
    }
    switch (role.tier) {
        case StudioTier.Executive:
        case StudioTier.Department:
            return departmentPermissions;
        case StudioTier.Contributor:
            return contributorPermissions;
        case StudioTier.Community:
            return memberPermissions;
    }
}

export function permissionsFor(tier: StudioTier): readonly bigint[] {
    switch (tier) {
        case StudioTier.Executive:
        case StudioTier.Department:
            return departmentPermissions;
        case StudioTier.Contributor:
            return contributorPermissions;
        case StudioTier.Community:
            return memberPermissions;
    }
}

export function targetStudioRoleNames(role: Role, specialties: readonly Specialty[]): Set<string> {
    const names = new Set<string>();

    if (role === Role.SuperAdmin || role === Role.Admin) {
        names.add("Admin");
    } else if (role === Role.Supervisor) {
        names.add("Supervisor");
    }

    for (const specialty of specialties) {
        const studio = studioRoles.find((r) => r.specialty === specialty);
        if (studio !== undefined) {
            names.add(studio.name);
        }
    }

    if (role === Role.Contributor || role === Role.SeniorContributor) {
        names.add(contributorRoleName);
    } else if (role === Role.Voter) {
        names.add("Voters");
    } else if (role === Role.Member) {
        names.add("Members");
    }

    return names;
}

export interface MemberRoleSyncResult {
    readonly modified: boolean;
    readonly added: readonly string[];
    readonly removed: readonly string[];
}

export async function syncMemberStudioRoles(
    member: GuildMember,
    role: Role,
    specialties: readonly Specialty[],
    reason = "Platform role sync"
): Promise<MemberRoleSyncResult> {
    const targetNames = targetStudioRoleNames(role, specialties);
    const guildRoles = await member.guild.roles.fetch();
    const rolesList = Array.from(guildRoles.values());

    const toAdd: string[] = [];
    const toRemove: string[] = [];

    // identify target studio roles to add
    for (const targetName of targetNames) {
        const guildRole = rolesList.find((r) => findStudioRole(r.name)?.name === targetName);
        if (guildRole !== undefined) {
            if (!member.roles.cache.has(guildRole.id)) {
                toAdd.push(guildRole.id);
            }
        } else {
            // auto-create role if missing from server
            const definition = studioRoles.find((r) => r.name === targetName);
            if (definition !== undefined) {
                const created = await member.guild.roles
                    .create({
                        name: definition.name,
                        colors: { primaryColor: definition.color },
                        hoist: definition.tier !== StudioTier.Community,
                        mentionable: definition.tier !== StudioTier.Community,
                        permissions: [...permissionsFor(definition.tier)],
                        reason: "Studio role auto-provision"
                    })
                    .catch(() => null);
                if (created !== null) {
                    toAdd.push(created.id);
                }
            }
        }
    }

    // strip obsolete studio roles and legacy roles
    for (const guildRole of rolesList) {
        if (!isStudioOrLegacyRole(guildRole.name)) {
            continue;
        }

        const studio = findStudioRole(guildRole.name);
        const shouldHave = studio !== undefined && targetNames.has(studio.name);
        const hasRole = member.roles.cache.has(guildRole.id);

        if (!shouldHave && hasRole) {
            toRemove.push(guildRole.id);
        }
    }

    if (toRemove.length > 0) {
        await member.roles.remove(toRemove, reason.slice(0, 400));
    }
    if (toAdd.length > 0) {
        await member.roles.add(toAdd, reason.slice(0, 400));
    }

    return {
        modified: toAdd.length > 0 || toRemove.length > 0,
        added: toAdd,
        removed: toRemove
    };
}
