export { PollType, RaidFlag, RaidSeverity, SeparationAction, SeparationStatus } from "@platform/scoring";

export enum Role {
    Voter = "voter",
    Contributor = "contributor",
    SeniorContributor = "senior_contributor",
    Moderator = "moderator",
    Supervisor = "supervisor",
    Admin = "admin"
}

export enum Specialty {
    // Executive Tier (Admin 0)
    Producer = "producer",
    CreativeDirector = "creative_director",
    ProductionManager = "production_manager",

    // Department Tier (Supervisors 1)
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

    // Contributor Tier (Contributors 2)
    Animator = "animator",
    LayoutArtist = "layout_artist",
    Modeler3d = "3d_modeler",
    Rigger = "rigger",
    SurfaceTextureArtist = "surface_texture_artist",
    LightingArtist = "lighting_artist",
    VfxArtist = "vfx_artist",
    ConceptArtist = "concept_artist",
    VoiceActor = "voice_actor",
    SoundDesigner = "sound_designer",
    VideoEditor = "video_editor",
    GeneralContributor = "general_contributor",
    Screenwriter = "screenwriter",

    // Community Tier (Voters 3)
    Voter = "voter"
}

export const maximumSpecialties = 2;

export enum RoundStatus {
    Draft = "draft",
    Open = "open",
    Closed = "closed",
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

export function enumValues<T extends Record<string, string>>(enumeration: T): [T[keyof T], ...T[keyof T][]] {
    return Object.values(enumeration) as [T[keyof T], ...T[keyof T][]];
}
