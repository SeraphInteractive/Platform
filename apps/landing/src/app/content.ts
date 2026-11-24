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
}

export const SECTIONS: readonly SectionLink[] = [
    { id: "home", label: "Home" },
    { id: "goal", label: "The Goal" },
    { id: "pipeline", label: "Pipeline" },
    { id: "contribute", label: "Contribute" }
];

export const GOALS: readonly { readonly title: string; readonly body: string }[] = [
    {
        title: "Made in the open",
        body: "Anyone can pick up a scene, submit an animation pass, and help build a feature film where everyone can watch it come together."
    },
    {
        title: "Shaped by votes",
        body: "Verified contributors vote on key story decisions, script elements, and community animation cuts to decide what makes the film."
    },
    {
        title: "Free to watch",
        body: "The entire film will be released for free on our official YouTube channel."
    }
];

export const PIPELINE_STEPS: readonly { readonly title: string; readonly body: string }[] = [
    { title: "Claim a scene", body: "Pick an open shot in the Grab-box on the studio platform." },
    { title: "Animate", body: "Download the blend files and rigs, then animate your shot." },
    { title: "Submit for review", body: "Upload your pass. Supervisors and the community review it." },
    { title: "Into the master cut", body: "Once a pass reaches consensus, it goes straight into the master cut." }
];

export const ROLES: readonly string[] = [
    "Blender animators",
    "Blockbench modelers",
    "Voice actors",
    "2D artists",
    "Video editors",
    "Sound designers"
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
