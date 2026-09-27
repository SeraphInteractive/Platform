"use client";

import type { UserDto } from "@platform/contracts";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

export function AppSidebar(): ReactNode {
    const pathname = usePathname();
    const { user } = useSession();
    const { discordInviteUrl } = useSiteConfig();
    const { setOpenMobile } = useSidebar();

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
            {discordInviteUrl !== null && (
                <SidebarFooter>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip="Join the Discord">
                                <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink />
                                    <span>Join the Discord</span>
                                </a>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            )}
            <SidebarRail />
        </Sidebar>
    );
}
