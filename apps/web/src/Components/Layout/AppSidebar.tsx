"use client";

import { Role, RoundStatus, ShotStatus, type UserDto } from "@platform/contracts";
import { useQueryClient, useQuery, type QueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { DiscordIcon, YouTubeIcon } from "@/Components/Icons/BrandIcons";
import { openDiscordInvite, toDiscordAppInviteUrl, toDiscordWebInviteUrl, useSiteConfig } from "@/Components/SiteConfig";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar
} from "@/Components/Ui/sidebar";
import { useSession } from "@/Hooks/UseSession";
import { hasAtLeast } from "@/Lib/Roles";
import { isActivePath, navigationGroups, type NavigationItem } from "./Navigation";

export function useStudioAccess(user: UserDto | null): boolean {
    const isAdmin = hasAtLeast(user, Role.Admin);
    const { data: hasAccess } = useQuery({
        queryKey: ["studio-access", user?.id],
        queryFn: async () => {
            const res = await fetch("/studio/script/api/session", { credentials: "same-origin" });
            if (!res.ok) return false;
            const payload = (await res.json().catch(() => null)) as {
                data?: { isInvited?: boolean; acceptedInvites?: unknown[] } | null;
            } | null;
            return Boolean(payload?.data?.isInvited || (payload?.data?.acceptedInvites && payload.data.acceptedInvites.length > 0));
        },
        enabled: Boolean(user && !isAdmin),
        staleTime: 60_000,
        retry: false
    });

    return isAdmin || Boolean(hasAccess);
}

export function isVisible(item: NavigationItem, user: UserDto | null, _hasStudioAccess = false): boolean {
    if (item.requiresSession === true && user === null) {
        return false;
    }
    if (item.href === "/studio/script") {
        // screenplay studio access is restricted strictly to admin and super_admin
        return hasAtLeast(user, Role.Admin);
    }
    return item.minimumRole === undefined || hasAtLeast(user, item.minimumRole);
}

function preloadData(queryClient: QueryClient, href: string): void {
    if (href === "/voting") {
        const query = { status: RoundStatus.Open, page: 1, perPage: 25 };
        queryClient.query({ queryKey: queryKeys.rounds(query), queryFn: () => platformApi.rounds(query) }).catch(() => undefined);
    } else if (href === "/grabbox") {
        const query = { page: 1, perPage: 25, status: ShotStatus.Available };
        queryClient.query({ queryKey: queryKeys.shots(query), queryFn: () => platformApi.shots(query) }).catch(() => undefined);
    } else if (href === "/roadmap" || href === "/") {
        queryClient.query({ queryKey: queryKeys.pipeline, queryFn: () => platformApi.pipeline() }).catch(() => undefined);
    }
}

export function AppSidebar(): ReactNode {
    const pathname = usePathname();
    const { user } = useSession();
    const hasStudioAccess = useStudioAccess(user);
    const { discordInviteUrl } = useSiteConfig();
    const { setOpenMobile } = useSidebar();
    const queryClient = useQueryClient();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="box-content h-12 justify-center border-b px-4 py-0 group-data-[collapsible=icon]:px-2">
                <Link href="/" className="truncate text-[15px] leading-6 font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                    Project Stairway
                </Link>
            </SidebarHeader>
            <SidebarContent>
                {navigationGroups.map((group) => {
                    const items = group.items.filter((item) => isVisible(item, user, hasStudioAccess));
                    if (items.length === 0) {
                        return null;
                    }
                    return (
                        <SidebarGroup key={group.label}>
                            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {items.map((item) => (
                                        <SidebarMenuItem key={item.href}>
                                            <SidebarMenuButton asChild isActive={isActivePath(pathname, item)} tooltip={item.label}>
                                                <Link
                                                    href={item.href}
                                                    prefetch
                                                    onMouseEnter={() => {
                                                        preloadData(queryClient, item.href);
                                                    }}
                                                    onFocus={() => {
                                                        preloadData(queryClient, item.href);
                                                    }}
                                                    onClick={() => {
                                                        setOpenMobile(false);
                                                    }}
                                                >
                                                    <item.icon />
                                                    <span>{item.label}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    );
                })}
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="YouTube">
                            <a href="https://www.youtube.com/@ProjectStairwayMovie" target="_blank" rel="noopener noreferrer">
                                <YouTubeIcon />
                                <span>YouTube</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    {toDiscordAppInviteUrl(discordInviteUrl) !== null && (
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip="Discord">
                                <a
                                    href={toDiscordWebInviteUrl(discordInviteUrl) ?? toDiscordAppInviteUrl(discordInviteUrl)!}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        openDiscordInvite(discordInviteUrl);
                                    }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <DiscordIcon />
                                    <span>Discord</span>
                                </a>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    )}
                </SidebarMenu>
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}
