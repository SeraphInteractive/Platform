import { Role } from "@platform/contracts";
import {
    Activity,
    BookOpen,
    BriefcaseBusiness,
    Clapperboard,
    ClipboardCheck,
    FileText,
    Gauge,
    Hammer,
    Home,
    LayoutDashboard,
    ListChecks,
    LifeBuoy,
    Map,
    MessageSquareHeart,
    UserRound,
    Users,
    Vote,
    type LucideIcon
} from "lucide-react";
import type { Route } from "next";

export interface NavigationItem {
    readonly href: Route;
    readonly label: string;
    readonly description: string;
    readonly icon: LucideIcon;
    readonly minimumRole?: Role;
    readonly requiresSession?: boolean;
    readonly exact?: boolean;
}

export interface NavigationGroup {
    readonly label: string;
    readonly items: readonly NavigationItem[];
}

export const navigationGroups: readonly NavigationGroup[] = [
    {
        label: "Take part",
        items: [
            { href: "/", label: "Overview", description: "What's happening on the project right now", icon: Home, exact: true },
            { href: "/voting", label: "Vote", description: "Pitch ideas and rank your favourites", icon: Vote },
            { href: "/grabbox", label: "Grab-box", description: "Claim a production task and deliver it", icon: Hammer },
            { href: "/roadmap", label: "Roadmap", description: "The road from pitch to final mix", icon: Map },
            {
                href: "/positions" as Route,
                label: "Positions",
                description: "Open roles on the project and how to apply",
                icon: BriefcaseBusiness
            },
            {
                href: "/profile",
                label: "Profile",
                description: "Your profile, tasks, submissions and standing",
                icon: UserRound,
                requiresSession: true
            }
        ]
    },
    {
        label: "Learn",
        items: [{ href: "/guidelines", label: "Guidelines", description: "How voting, contributing and fair play work", icon: BookOpen }]
    },
    {
        label: "Management",
        items: [
            {
                href: "/studio",
                label: "Dashboard",
                description: "Everything waiting on staff",
                icon: LayoutDashboard,
                minimumRole: Role.Supervisor,
                exact: true
            },
            {
                href: "/studio/script" as Route,
                label: "Desk",
                description: "Screenplay studio and writer room",
                icon: Clapperboard,
                minimumRole: Role.Admin
            },
            {
                href: "/studio/rounds",
                label: "Rounds",
                description: "Run voting rounds and moderate entries",
                icon: ListChecks,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/telemetry" as Route,
                label: "Telemetry",
                description: "Raid detection, invariance, and ballot network",
                icon: Activity,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/reviews",
                label: "Reviews",
                description: "Approve delivered work",
                icon: ClipboardCheck,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/tasks",
                label: "Tasks",
                description: "Create and manage grab-box tasks",
                icon: Gauge,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/people",
                label: "People",
                description: "Roles, specialties and voting access",
                icon: Users,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/tickets" as Route,
                label: "Tickets",
                description: "Tickets, applications and the Discord hubs",
                icon: LifeBuoy,
                minimumRole: Role.Supervisor
            },
            {
                href: "/studio/feedback" as Route,
                label: "Crew feedback",
                description: "Private crew check-ins on department supervisors",
                icon: MessageSquareHeart,
                minimumRole: Role.Admin
            },
            {
                href: "/studio/content",
                label: "Content",
                description: "Edit the guidelines and legal pages",
                icon: FileText,
                minimumRole: Role.SuperAdmin
            }
        ]
    }
];

export const segmentLabels: Readonly<Record<string, string>> = {
    voting: "Vote",
    grabbox: "Grab-box",
    roadmap: "Roadmap",
    me: "My work",
    profile: "Profile",
    guidelines: "Guidelines",
    studio: "Studio",
    script: "Desk",
    rounds: "Rounds",
    telemetry: "Telemetry",
    reviews: "Reviews",
    tasks: "Tasks",
    tickets: "Tickets",
    feedback: "Crew feedback",
    positions: "Positions",
    people: "People",
    auth: "Sign in",
    callback: "Signing in",
    content: "Content",
    legal: "Legal",
    terms: "Terms",
    privacy: "Privacy",
    "acceptable-use": "Acceptable use",
    verify: "Verify"
};

export function isActivePath(pathname: string, item: NavigationItem): boolean {
    return item.exact === true ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
