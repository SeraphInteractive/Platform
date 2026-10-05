"use client";

import { useQuery } from "@tanstack/react-query";
import { Hammer, LogIn, LogOut, Moon, Search, Vote } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Button } from "@/Components/Ui/button";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from "@/Components/Ui/command";
import { Kbd } from "@/Components/Ui/kbd";
import { loginHref, useLogout, useSession } from "@/Hooks/UseSession";
import { roundStatusLabels, shotStatusLabels } from "@/Lib/Format";
import { isVisible } from "./AppSidebar";
import { navigationGroups } from "./Navigation";

export function CommandMenu(): ReactNode {
    const router = useRouter();
    const pathname = usePathname();
    const { user } = useSession();
    const logout = useLogout();
    const { resolvedTheme, setTheme } = useTheme();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                setOpen((current) => !current);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    const roundsQuery = { page: 1, perPage: 50 };
    const rounds = useQuery({ queryKey: queryKeys.rounds(roundsQuery), queryFn: () => platformApi.rounds(roundsQuery), enabled: open });
    const shotsQuery = { page: 1, perPage: 50 };
    const shots = useQuery({ queryKey: queryKeys.shots(shotsQuery), queryFn: () => platformApi.shots(shotsQuery), enabled: open });

    const go = (href: string): void => {
        setOpen(false);
        router.push(href as Route);
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                className="text-muted-foreground w-9 justify-start gap-2 px-2 sm:w-56 sm:px-3"
                onClick={() => {
                    setOpen(true);
                }}
                aria-label="Search"
            >
                <Search />
                <span className="hidden flex-1 text-left sm:inline">Search…</span>
                <Kbd className="hidden sm:inline-flex">Ctrl K</Kbd>
            </Button>
            <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Jump to a page, round or task">
                <CommandInput placeholder="Search pages, rounds and tasks…" />
                <CommandList>
                    <CommandEmpty>Nothing matches that.</CommandEmpty>
                    {navigationGroups.map((group) => {
                        const items = group.items.filter((item) => isVisible(item, user));
                        return items.length === 0 ? null : (
                            <CommandGroup key={group.label} heading={group.label}>
                                {items.map((item) => (
                                    <CommandItem
                                        key={item.href}
                                        value={`${item.label} ${item.description}`}
                                        onSelect={() => {
                                            go(item.href);
                                        }}
                                    >
                                        <item.icon />
                                        <span>{item.label}</span>
                                        <span className="text-muted-foreground ml-auto hidden truncate text-xs sm:inline">
                                            {item.description}
                                        </span>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        );
                    })}
                    {(rounds.data?.data.length ?? 0) > 0 && (
                        <CommandGroup heading="Rounds">
                            {rounds.data?.data.map((round) => (
                                <CommandItem
                                    key={round.id}
                                    value={`round ${round.title} ${round.id}`}
                                    onSelect={() => {
                                        go(`/voting/${round.id}`);
                                    }}
                                >
                                    <Vote />
                                    <span className="truncate">{round.title}</span>
                                    <span className="text-muted-foreground ml-auto text-xs">{roundStatusLabels[round.status]}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    {(shots.data?.data.length ?? 0) > 0 && (
                        <CommandGroup heading="Tasks">
                            {shots.data?.data.map((shot) => (
                                <CommandItem
                                    key={shot.id}
                                    value={`task ${shot.shotCode} ${shot.title} ${shot.id}`}
                                    onSelect={() => {
                                        go(`/grabbox/${shot.id}`);
                                    }}
                                >
                                    <Hammer />
                                    <span className="truncate">
                                        {shot.shotCode} · {shot.title}
                                    </span>
                                    <span className="text-muted-foreground ml-auto text-xs">{shotStatusLabels[shot.status]}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    <CommandSeparator />
                    <CommandGroup heading="Actions">
                        <CommandItem
                            value="toggle theme dark light"
                            onSelect={() => {
                                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                                setOpen(false);
                            }}
                        >
                            <Moon />
                            Toggle light and dark
                        </CommandItem>
                        {user === null ? (
                            <CommandItem
                                value="sign in login discord"
                                onSelect={() => {
                                    window.location.assign(loginHref(pathname));
                                }}
                            >
                                <LogIn />
                                Sign in with Discord
                            </CommandItem>
                        ) : (
                            <CommandItem
                                value="sign out logout"
                                onSelect={() => {
                                    setOpen(false);
                                    logout.mutate();
                                }}
                            >
                                <LogOut />
                                Sign out
                            </CommandItem>
                        )}
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    );
}
