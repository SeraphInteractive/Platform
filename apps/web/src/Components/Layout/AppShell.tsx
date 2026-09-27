"use client";

import { CircleUser, LogIn, LogOut, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense, type ReactNode } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/Components/Ui/dropdown-menu";
import { Separator } from "@/Components/Ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/Components/Ui/sidebar";
import { Skeleton } from "@/Components/Ui/skeleton";
import { TermsGate } from "@/Features/Legal/TermsGate";
import { loginHref, useLogout, useSession } from "@/Hooks/UseSession";
import { roleLabels } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { AppSidebar } from "./AppSidebar";
import { BreadcrumbProvider, Breadcrumbs } from "./Breadcrumbs";
import { CommandMenu } from "./CommandMenu";
import { TopProgress } from "./TopProgress";

function ThemeToggle(): ReactNode {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle light and dark"
            onClick={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
            }}
        >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
        </Button>
    );
}

function UserMenu(): ReactNode {
    const pathname = usePathname();
    const { user, isLoading } = useSession();
    const logout = useLogout();

    if (isLoading) {
        return <Skeleton className="size-8 rounded-full" />;
    }
    if (user === null) {
        return (
            <Button asChild size="sm">
                <a href={loginHref(pathname)}>
                    <LogIn />
                    <span className="hidden sm:inline">Sign in</span>
                </a>
            </Button>
        );
    }
    const avatar = safeHttpUrl(user.avatarUrl);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Your account">
                    <Avatar className="size-8">
                        {avatar !== null && <AvatarImage src={avatar} alt="" />}
                        <AvatarFallback>{user.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate">{user.username}</span>
                    <span className="text-muted-foreground text-xs font-normal">{roleLabels[user.role]}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/profile">
                        <CircleUser />
                        Profile
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href="/me">
                        <UserRound />
                        My work
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={logout.isPending}
                    onSelect={() => {
                        logout.mutate();
                    }}
                >
                    <LogOut />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function AppShell({ defaultOpen, children }: { readonly defaultOpen: boolean; readonly children: ReactNode }): ReactNode {
    return (
        <SidebarProvider defaultOpen={defaultOpen}>
            <BreadcrumbProvider>
                <Suspense fallback={null}>
                    <TopProgress />
                </Suspense>
                <a
                    href="#main"
                    className="bg-primary text-primary-foreground sr-only z-50 px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
                >
                    Skip to content
                </a>
                <AppSidebar />
                <SidebarInset className="min-w-0">
                    <header className="bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 box-content flex h-12 shrink-0 items-center gap-2 border-b px-6 backdrop-blur">
                        <SidebarTrigger className="-ml-[6px]" />
                        <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
                        <div className="min-w-0 flex-1">
                            <Breadcrumbs />
                        </div>
                        <CommandMenu />
                        <ThemeToggle />
                        <div className="flex w-24 shrink-0 justify-end">
                            <UserMenu />
                        </div>
                    </header>
                    <div id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
                        <TermsGate>{children}</TermsGate>
                    </div>
                </SidebarInset>
            </BreadcrumbProvider>
        </SidebarProvider>
    );
}
