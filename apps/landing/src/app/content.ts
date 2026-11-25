export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://projectstairway.net";
export const APP_URL = "https://app.projectstairway.net";
export const DISCORD_URL = "https://discord.gg/WP7dhVzkaV";
export const YOUTUBE_URL = "https://www.youtube.com/@ProjectStairwayMovie";

export const SITE_TITLE = "Project Stairway";
export const SITE_DESCRIPTION =
    "A community-driven Minecraft animated feature film built in the open. Claim shots, animate in Blender, and vote on the master cut.";

export interface SectionLink {
    readonly id: string;
    readonly label: string;
    readonly bgSrc: string;
    readonly scrimClass: string;
    readonly mobileBgSrc?: string;
}

export interface InfographicStation {
    readonly id: string;
    readonly label: string;
    readonly tag: string;
}

export const SECTIONS: readonly SectionLink[] = [
    {
        id: "home",
        label: "Home",
        bgSrc: "/hero.webp",
        scrimClass: ""
    },
    {
        id: "goal",
        label: "Goal",
        bgSrc: "/backgrounds/1.png",
        scrimClass: "bg-linear-to-r from-[#0d0512]/84 via-[#12091c]/42 to-transparent"
    },
    {
        id: "pipeline",
        label: "Pipeline",
        bgSrc: "/backgrounds/2.webp",
        scrimClass:
            "bg-linear-to-r from-[#0d0512]/88 via-[#0d0512]/62 to-[#0d0512]/25 md:bg-linear-to-t md:from-[#0d0512]/90 md:via-[#0d0512]/16 md:to-[#12091c]/52",
        mobileBgSrc: "/backgrounds/cogi.png"
    },
    {
        id: "register",
        label: "Register",
        bgSrc: "/backgrounds/3.png",
        scrimClass: "bg-linear-to-r from-[#0b0410]/60 via-transparent to-[#0b0410]/35"
    },
    {
        id: "apply",
        label: "Apply",
        bgSrc: "/backgrounds/4.jpg",
        scrimClass: "bg-linear-to-t from-[#0d0512]/92 via-[#12091c]/42 to-[#0d0512]/30"
    }
];

export const GOAL_STATIONS: readonly InfographicStation[] = [
    { id: "blender", label: "Open Blender Film", tag: "Built in public" },
    { id: "votes", label: "Community Voted", tag: "Members steer story" },
    { id: "youtube", label: "Free Release", tag: "YouTube + full credits" }
];

export const PIPELINE_STATIONS: readonly InfographicStation[] = [
    { id: "vote", label: "Vote", tag: "Pick direction" },
    { id: "brief", label: "Grab Box", tag: "Leads split tasks" },
    { id: "animate", label: "Animate", tag: ".blend + preview" },
    { id: "edit", label: "Edit", tag: "Lighting, FX & sound" },
    { id: "cut", label: "Master Cut", tag: "QA merged in" },
    { id: "release", label: "Release", tag: "Free on YouTube" }
];

export const REGISTER_STATIONS: readonly InfographicStation[] = [
    { id: "discord", label: "Join Discord", tag: "Crew & channels" },
    { id: "studio", label: "Studio Login", tag: "Connect at app" },
    { id: "verify", label: "Verify + CLA", tag: "Unlocks voting" }
];

export const APPLY_STATIONS: readonly InfographicStation[] = [
    { id: "craft", label: "Pick Craft", tag: "5 departments" },
    { id: "ticket", label: "Discord Ticket", tag: "Send portfolio" },
    { id: "grant", label: "Lead Approval", tag: "Manual role grant" },
    { id: "contribute", label: "Contribute", tag: "And get credited" }
];

export const PARTNERS: readonly {
    readonly name: string;
    readonly href: string;
    readonly src: string;
    readonly width: number;
    readonly height: number;
}[] = [
    { name: "Squared Media", href: "https://squaredmedia.org", src: "/partners/sqm.png", width: 469, height: 186 },
    { name: "Prism Nodes", href: "https://prismnodes.com", src: "/partners/prismnodes.png", width: 640, height: 190 }
];

export const LEGAL_LINKS: readonly { readonly label: string; readonly href: string }[] = [
    { label: "Terms", href: `${APP_URL}/legal/terms` },
    { label: "Privacy", href: `${APP_URL}/legal/privacy` },
    { label: "Acceptable use", href: `${APP_URL}/legal/acceptable-use` }
];
