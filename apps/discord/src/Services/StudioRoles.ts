import { Role, Specialty } from "@platform/contracts";
import { PermissionFlagsBits } from "discord.js";

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

const departmentPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ViewAuditLog,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
];

const contributorPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseApplicationCommands,
    PermissionFlagsBits.ReadMessageHistory
];

const communityPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseApplicationCommands
];

export const studioRoles: readonly StudioRole[] = Object.freeze([
    { name: "Producer", tier: StudioTier.Executive, color: 0xe74c3c, specialty: Specialty.Producer },
    { name: "Creative Director", tier: StudioTier.Executive, color: 0x9b59b6, specialty: Specialty.CreativeDirector },
    { name: "Production Manager", tier: StudioTier.Executive, color: 0xc0392b, specialty: Specialty.ProductionManager },
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
    { name: "General Contributors", tier: StudioTier.Contributor, color: 0x3498db, specialty: Specialty.GeneralContributor },
    { name: "Voters", tier: StudioTier.Community, color: 0x34495e, specialty: Specialty.Voter },
    { name: "Observer", tier: StudioTier.Community, color: 0x95a5a6 }
]);

export const observerRoleName = "Observer";
export const contributorRoleName = "General Contributors";

export function normalizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/gu, "");
}

export function findStudioRole(name: string): StudioRole | undefined {
    const normalized = normalizeName(name);
    return studioRoles.find((role) => normalizeName(role.name) === normalized);
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

export function permissionsFor(tier: StudioTier): readonly bigint[] {
    switch (tier) {
        case StudioTier.Executive:
        case StudioTier.Department:
            return departmentPermissions;
        case StudioTier.Contributor:
            return contributorPermissions;
        case StudioTier.Community:
            return communityPermissions;
    }
}
