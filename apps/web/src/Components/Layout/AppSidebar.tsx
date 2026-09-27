"use client";

import { RoundStatus, ShotStatus, type UserDto } from "@platform/contracts";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { useSiteConfig } from "@/Components/SiteConfig";
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

export function isVisible(item: NavigationItem, user: UserDto | null): boolean {
    if (item.requiresSession === true && user === null) {
        return false;
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
                    const items = group.items.filter((item) => isVisible(item, user));
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
                                <ExternalLink />
                                <span>YouTube</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    {discordInviteUrl !== null && (
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip="Join the Discord">
                                <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink />
                                    <span>Join the Discord</span>
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
