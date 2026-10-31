export { PollType, RaidFlag, RaidSeverity, SeparationAction, SeparationStatus } from "@platform/scoring";

export enum Role {
    // Postgres enum order is append-only: add new values at the end.
    Voter = "voter",
    Contributor = "contributor",
    SeniorContributor = "senior_contributor",
    Supervisor = "supervisor",
    Admin = "admin",
    SuperAdmin = "super_admin",
    Member = "member"
}

export const roleLabels: Readonly<Record<Role, string>> = {
    [Role.Member]: "Member",
    [Role.Voter]: "Voter",
    [Role.Contributor]: "Contributor",
    [Role.SeniorContributor]: "Senior Contributor",
    [Role.Supervisor]: "Supervisor",
    [Role.Admin]: "Admin",
    [Role.SuperAdmin]: "Super admin"
};

export function roleLabel(role: Role): string {
    return roleLabels[role] ?? role;
}

export enum Specialty {
    // Postgres enum order is append-only: add new values at the end.
    Animator = "animator",
    LayoutArtist = "layout_artist",
    Modeler3d = "3d_modeler",
    Rigger = "rigger",
    SurfaceTextureArtist = "surface_texture_artist",
    LightingArtist = "lighting_artist",
    VfxArtist = "vfx_artist",
    ConceptArtist = "concept_artist",
    Screenwriter = "screenwriter",
    VoiceActor = "voice_actor",
    SoundDesigner = "sound_designer",
    VideoEditor = "video_editor",
    GeneralContributor = "general_contributor",
    Producer = "producer",
    CreativeDirector = "creative_director",
    ProductionManager = "production_manager",
    TechnicalDirector = "technical_director",
    ArtDirector = "art_director",
    EditorialSupervisor = "editorial_supervisor",
    LayoutPrevisLead = "layout_previs_lead",
    ModellingSupervisor = "modelling_supervisor",
    RiggingSupervisor = "rigging_supervisor",
    SurfacingLookDevLead = "surfacing_lookdev_lead",
    AnimationSupervisor = "animation_supervisor",
    CfxVfxSupervisor = "cfx_vfx_supervisor",
    LightingCompositingSupervisor = "lighting_compositing_supervisor",
    SoundDirector = "sound_director",
    Voter = "voter",
    MediaTeam = "media_team",
    ModelingAndSurfacingLead = "modeling_and_surfacing_lead",
    LightingAndVfxLead = "lighting_and_vfx_lead"
}

export const maximumSpecialties = 2;
export const maximumTotalSpecialties = 3;

export enum ShotType {
    // postgres enum order is append-only
    Modelling3d = "3d_modelling",
    Rigging = "rigging",
    Animation = "animation",
    Vfx = "vfx",
    SurfaceTextureArt = "surface_texture_art",
    Lighting = "lighting",
    ConceptArt = "concept_art",
    VideoEditing = "video_editing",
    SoundDesign = "sound_design",
    VoiceActing = "voice_acting"
}

export enum DepartmentSlug {
    ArtAndWriting = "art-and-writing",
    Assets = "assets",
    Animation = "animation",
    LightingAndVfx = "lighting-and-vfx",
    PostProduction = "post-production"
}

export interface DepartmentDefinition {
    readonly slug: DepartmentSlug;
    readonly name: string;
    readonly supervisorSpecialties: readonly Specialty[];
    readonly contributorSpecialties: readonly Specialty[];
    readonly shotTypes: readonly ShotType[];
}

export const departmentDefinitions: readonly DepartmentDefinition[] = Object.freeze([
    {
        slug: DepartmentSlug.ArtAndWriting,
        name: "Art and Writing",
        supervisorSpecialties: [Specialty.ArtDirector],
        contributorSpecialties: [Specialty.ConceptArtist, Specialty.Screenwriter],
        shotTypes: [ShotType.ConceptArt]
    },
    {
        slug: DepartmentSlug.Assets,
        name: "Assets",
        supervisorSpecialties: [
            Specialty.ModelingAndSurfacingLead,
            Specialty.ModellingSupervisor,
            Specialty.RiggingSupervisor,
            Specialty.SurfacingLookDevLead
        ],
        contributorSpecialties: [Specialty.Modeler3d, Specialty.SurfaceTextureArtist, Specialty.Rigger],
        shotTypes: [ShotType.Modelling3d, ShotType.Rigging, ShotType.SurfaceTextureArt]
    },
    {
        slug: DepartmentSlug.Animation,
        name: "Animation",
        supervisorSpecialties: [Specialty.LayoutPrevisLead, Specialty.AnimationSupervisor],
        contributorSpecialties: [Specialty.LayoutArtist, Specialty.Animator],
        shotTypes: [ShotType.Animation]
    },
    {
        slug: DepartmentSlug.LightingAndVfx,
        name: "Lighting and VFX",
        supervisorSpecialties: [Specialty.LightingAndVfxLead, Specialty.CfxVfxSupervisor, Specialty.LightingCompositingSupervisor],
        contributorSpecialties: [Specialty.LightingArtist, Specialty.VfxArtist],
        shotTypes: [ShotType.Lighting, ShotType.Vfx]
    },
    {
        slug: DepartmentSlug.PostProduction,
        name: "Post-Production",
        supervisorSpecialties: [Specialty.EditorialSupervisor, Specialty.SoundDirector],
        contributorSpecialties: [Specialty.VideoEditor, Specialty.SoundDesigner, Specialty.VoiceActor],
        shotTypes: [ShotType.VideoEditing, ShotType.SoundDesign, ShotType.VoiceActing]
    }
]);

export const shotTypeToDepartment: Readonly<Record<ShotType, DepartmentSlug>> = Object.freeze({
    [ShotType.ConceptArt]: DepartmentSlug.ArtAndWriting,
    [ShotType.Modelling3d]: DepartmentSlug.Assets,
    [ShotType.Rigging]: DepartmentSlug.Assets,
    [ShotType.SurfaceTextureArt]: DepartmentSlug.Assets,
    [ShotType.Animation]: DepartmentSlug.Animation,
    [ShotType.Lighting]: DepartmentSlug.LightingAndVfx,
    [ShotType.Vfx]: DepartmentSlug.LightingAndVfx,
    [ShotType.VideoEditing]: DepartmentSlug.PostProduction,
    [ShotType.SoundDesign]: DepartmentSlug.PostProduction,
    [ShotType.VoiceActing]: DepartmentSlug.PostProduction
});

export const shotTypeRequiredSpecialty: Readonly<Record<ShotType, Specialty>> = Object.freeze({
    [ShotType.ConceptArt]: Specialty.ConceptArtist,
    [ShotType.Modelling3d]: Specialty.Modeler3d,
    [ShotType.Rigging]: Specialty.Rigger,
    [ShotType.SurfaceTextureArt]: Specialty.SurfaceTextureArtist,
    [ShotType.Animation]: Specialty.Animator,
    [ShotType.Lighting]: Specialty.LightingArtist,
    [ShotType.Vfx]: Specialty.VfxArtist,
    [ShotType.VideoEditing]: Specialty.VideoEditor,
    [ShotType.SoundDesign]: Specialty.SoundDesigner,
    [ShotType.VoiceActing]: Specialty.VoiceActor
});

export const shotTypeRequiredSpecialties: Readonly<Record<ShotType, readonly Specialty[]>> = Object.freeze({
    [ShotType.ConceptArt]: [Specialty.ConceptArtist],
    [ShotType.Modelling3d]: [Specialty.Modeler3d],
    [ShotType.Rigging]: [Specialty.Rigger],
    [ShotType.SurfaceTextureArt]: [Specialty.SurfaceTextureArtist],
    [ShotType.Animation]: [Specialty.Animator, Specialty.LayoutArtist],
    [ShotType.Lighting]: [Specialty.LightingArtist],
    [ShotType.Vfx]: [Specialty.VfxArtist],
    [ShotType.VideoEditing]: [Specialty.VideoEditor],
    [ShotType.SoundDesign]: [Specialty.SoundDesigner],
    [ShotType.VoiceActing]: [Specialty.VoiceActor]
});

export const supervisorGrantableSpecialties: Readonly<Partial<Record<Specialty, readonly Specialty[]>>> = Object.freeze({
    [Specialty.ArtDirector]: [Specialty.ConceptArtist, Specialty.Screenwriter],
    [Specialty.ModelingAndSurfacingLead]: [Specialty.SurfaceTextureArtist, Specialty.Modeler3d],
    [Specialty.ModellingSupervisor]: [Specialty.Modeler3d],
    [Specialty.RiggingSupervisor]: [Specialty.Rigger],
    [Specialty.SurfacingLookDevLead]: [Specialty.SurfaceTextureArtist, Specialty.Modeler3d, Specialty.Rigger],
    [Specialty.LayoutPrevisLead]: [Specialty.LayoutArtist],
    [Specialty.AnimationSupervisor]: [Specialty.Animator, Specialty.VideoEditor],
    [Specialty.LightingAndVfxLead]: [Specialty.LightingArtist, Specialty.VfxArtist],
    [Specialty.CfxVfxSupervisor]: [Specialty.VfxArtist],
    [Specialty.LightingCompositingSupervisor]: [Specialty.LightingArtist, Specialty.VfxArtist],
    [Specialty.EditorialSupervisor]: [Specialty.VideoEditor],
    [Specialty.SoundDirector]: [Specialty.SoundDesigner, Specialty.VoiceActor]
});

export const initialTermsVersion = "2026-09-27";

export enum DocumentSlug {
    Guidelines = "guidelines",
    Rules = "rules",
    Terms = "terms",
    Privacy = "privacy",
    AcceptableUse = "acceptable-use"
}

export const legalDocumentSlugs: readonly DocumentSlug[] = [DocumentSlug.Terms, DocumentSlug.Privacy, DocumentSlug.AcceptableUse];

export const documentLimits = {
    sectionIdLength: 64,
    sections: 40,
    sectionHtmlLength: 100_000
} as const;

export const emailCodeLength = 6;

export const selfSelectableSpecialties: readonly Specialty[] = [
    Specialty.Animator,
    Specialty.LayoutArtist,
    Specialty.Modeler3d,
    Specialty.Rigger,
    Specialty.SurfaceTextureArtist,
    Specialty.LightingArtist,
    Specialty.VfxArtist,
    Specialty.ConceptArtist,
    Specialty.Screenwriter,
    Specialty.VoiceActor,
    Specialty.SoundDesigner,
    Specialty.VideoEditor
];

export const adminSpecialties: readonly Specialty[] = [
    Specialty.Producer,
    Specialty.CreativeDirector,
    Specialty.ProductionManager,
    Specialty.TechnicalDirector
];

export const supervisorSpecialties: readonly Specialty[] = [
    Specialty.ArtDirector,
    Specialty.ModelingAndSurfacingLead,
    Specialty.RiggingSupervisor,
    Specialty.LayoutPrevisLead,
    Specialty.AnimationSupervisor,
    Specialty.LightingAndVfxLead,
    Specialty.EditorialSupervisor,
    Specialty.SoundDirector
];

export const exclusiveSpecialties: readonly Specialty[] = [...adminSpecialties, ...supervisorSpecialties];

export const teamSpecialties: readonly Specialty[] = [Specialty.MediaTeam];

export const assignableSpecialties: readonly Specialty[] = [...adminSpecialties, ...supervisorSpecialties, ...teamSpecialties];

export function specialtyLabel(specialty: Specialty): string {
    if (specialty === Specialty.LightingAndVfxLead) {
        return "Lighting and VFX Lead";
    }
    if (specialty === Specialty.ModelingAndSurfacingLead) {
        return "Modeling and Surfacing Lead";
    }
    const words = specialty.split("_").map((word) => (word === "3d" ? "3D" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`));
    return words.join(" ");
}

export enum RoundStatus {
    Draft = "draft",
    Open = "open",
    Voting = "voting",
    Finalized = "finalized"
}

export enum EntryStatus {
    PendingReview = "pending_review",
    Approved = "approved",
    Rejected = "rejected",
    Flagged = "flagged"
}

export enum DifficultyTier {
    Easy = "easy",
    Medium = "medium",
    Hard = "hard",
    Complex = "complex"
}

export enum ShotStatus {
    Available = "available",
    Claimed = "claimed",
    Submitted = "submitted",
    Approved = "approved"
}

export enum SubmissionStatus {
    PendingReview = "pending_review",
    RevisionRequested = "revision_requested",
    Approved = "approved"
}

export enum ReviewDecision {
    Approved = "approved",
    RevisionRequested = "revision_requested"
}

export enum DeliverableKind {
    Video = "video",
    Blend = "blend"
}

export enum PresenceStatus {
    Online = "online",
    Idle = "idle",
    DoNotDisturb = "dnd",
    Offline = "offline"
}

export enum MediaContentType {
    Png = "image/png",
    Jpeg = "image/jpeg",
    Gif = "image/gif",
    Webp = "image/webp",
    Mp4 = "video/mp4",
    Webm = "video/webm",
    QuickTime = "video/quicktime"
}

export const deliverableContentTypes: Readonly<Record<DeliverableKind, readonly string[]>> = {
    [DeliverableKind.Video]: ["video/mp4", "video/webm", "video/quicktime"],
    [DeliverableKind.Blend]: ["application/x-blender", "application/octet-stream"]
};

export enum ScreenplayRole {
    Editor = "editor",
    Viewer = "viewer"
}

export function enumValues<T extends Record<string, string>>(enumeration: T): [T[keyof T], ...T[keyof T][]] {
    return Object.values(enumeration) as [T[keyof T], ...T[keyof T][]];
}
