"use client";

import { DifficultyTier, Role, ShotStatus, type ShotDto } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Film, Images } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { platformApi, type ShotQuery } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { CountdownTimer } from "@/Components/Common/CountdownTimer";
import { Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState } from "@/Components/Common/States";
import { ShotStatusBadge } from "@/Components/Common/StatusBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/Ui/avatar";
import { Button } from "@/Components/Ui/button";
import { Input } from "@/Components/Ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { Skeleton } from "@/Components/Ui/skeleton";
import { useSession } from "@/Hooks/UseSession";
import { difficultyLabels, shotStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { safeHttpUrl } from "@/Lib/SafeUrl";
import { SeniorLock } from "./ShotMeta";
import { useMyShots } from "./UseMyShots";

const anyValue = "any";
const shotIdSchema = z.uuid();

function ActiveClaimBanner(): ReactNode {
    const { user } = useSession();
    const myShots = useMyShots(user !== null ? user.id : null);
    const active = myShots.active;
    if (active === null) {
        return null;
    }
    return (
        <div className="border-primary/40 bg-primary/5 mb-4 flex items-center gap-3 rounded-lg border px-3.5 py-2.5 shadow-xs">
            <span className="text-primary text-xs font-semibold uppercase tracking-wider">Your task</span>
            <span className="min-w-0 flex-1 truncate text-sm">
                <span className="text-muted-foreground font-mono text-xs">{active.shotCode}</span>{" "}
                <span className="font-medium text-foreground">{active.title}</span>
            </span>
            {active.deadlineAt !== null && (
                <span className="hidden sm:inline-flex">
                    <CountdownTimer targetDate={active.deadlineAt} prefix="Due in" />
                </span>
            )}
            <Button asChild size="xs">
                <Link href={`/grabbox/${active.id}` as Route}>Open</Link>
            </Button>
        </div>
    );
}

export function LoadingCards({ count = 8 }: { readonly count?: number }): ReactNode {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading tasks">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="bg-card flex flex-col overflow-hidden rounded-xl border">
                    <Skeleton className="aspect-video w-full rounded-none" />
                    <div className="flex flex-1 flex-col p-3.5 gap-2.5">
                        <div className="flex justify-between">
                            <Skeleton className="h-3.5 w-16" />
                            <Skeleton className="h-3.5 w-20" />
                        </div>
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-3 w-3/5" />
                        <div className="mt-auto pt-2.5 border-t">
                            <Skeleton className="h-4 w-1/2" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ShotCard({ shot }: { readonly shot: ShotDto }): ReactNode {
    const claimantAvatar = shot.claimer !== null ? safeHttpUrl(shot.claimer.avatarUrl) : null;

    return (
        <Link
            href={`/grabbox/${shot.id}` as Route}
            className="group bg-card text-card-foreground hover:border-primary/50 focus-visible:ring-ring flex flex-col overflow-hidden rounded-xl border shadow-xs transition-all duration-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
        >
            <div className="relative aspect-video w-full overflow-hidden bg-muted/40 border-b">
                {shot.imageUrls.length > 0 ? (
                    <img
                        src={shot.imageUrls[0]}
                        alt={shot.title}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground/40 bg-muted/20">
                        <Film className="size-8 stroke-[1.25]" aria-hidden="true" />
                        <span className="font-mono text-[11px] font-medium tracking-wide">Scene {shot.sceneNumber}</span>
                    </div>
                )}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="bg-background/90 text-foreground shadow-xs backdrop-blur-xs rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide border border-border/50">
                        {shot.shotCode}
                    </span>
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                    {shot.isSeniorLocked && shot.seniorPriorityUntil !== null && (
                        <CountdownTimer targetDate={shot.seniorPriorityUntil} prefix="Lock" icon="lock" />
                    )}
                    {shot.status !== ShotStatus.Available && <ShotStatusBadge status={shot.status} />}
                </div>
                {shot.imageUrls.length > 1 && (
                    <span className="bg-background/80 text-muted-foreground shadow-xs backdrop-blur-xs absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium border border-border/40 flex items-center gap-1">
                        <Images className="size-2.5" />
                        {shot.imageUrls.length}
                    </span>
                )}
            </div>

            <div className="flex flex-1 flex-col p-3.5 gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Scene {shot.sceneNumber}</span>
                    <span className="font-medium">
                        {difficultyLabels[shot.difficultyTier]} · {shot.tierDays}d
                    </span>
                </div>

                <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary transition-colors">{shot.title}</h3>

                {shot.description !== null && (
                    <p className="line-clamp-2 text-xs text-muted-foreground/80 leading-relaxed">{shot.description}</p>
                )}

                <div className="mt-auto pt-2.5 border-t flex items-center justify-between text-xs text-muted-foreground gap-2">
                    {shot.claimer !== null ? (
                        <div className="flex min-w-0 items-center gap-1.5">
                            <Avatar size="sm" className="size-5 border">
                                {claimantAvatar !== null && <AvatarImage src={claimantAvatar} alt="" />}
                                <AvatarFallback className="text-[9px] font-semibold">
                                    {shot.claimer.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="truncate font-medium text-foreground">{shot.claimer.username}</span>
                            {shot.deadlineAt !== null && (
                                <span className="text-muted-foreground shrink-0 text-[11px]">
                                    · <RelativeTime value={shot.deadlineAt} prefix="due" />
                                </span>
                            )}
                        </div>
                    ) : shot.isSeniorLocked ? (
                        <SeniorLock shot={shot} />
                    ) : (
                        <span className="text-success inline-flex items-center gap-1 text-xs font-medium">● Available</span>
                    )}
                </div>
            </div>
        </Link>
    );
}

export function GrabboxView(): ReactNode {
    const router = useRouter();
    const searchParams = useSearchParams();
    const legacyShotId = searchParams.get("shotId");

    useEffect(() => {
        if (legacyShotId !== null && shotIdSchema.safeParse(legacyShotId).success) {
            router.replace(`/grabbox/${legacyShotId}` as Route);
        }
    }, [legacyShotId, router]);

    const [status, setStatus] = useState<ShotStatus | typeof anyValue>(anyValue);
    const [difficulty, setDifficulty] = useState<DifficultyTier | typeof anyValue>(anyValue);
    const [scene, setScene] = useState("");
    const [page, setPage] = useState(1);

    const sceneNumber = /^\d{1,6}$/u.test(scene) && Number(scene) > 0 ? Number(scene) : undefined;
    const query: ShotQuery = {
        page,
        perPage: 24,
        status: status === anyValue ? undefined : status,
        difficultyTier: difficulty === anyValue ? undefined : difficulty,
        sceneNumber
    };
    const shots = useQuery({
        queryKey: queryKeys.shots(query),
        queryFn: () => platformApi.shots(query),
        placeholderData: keepPreviousData
    });

    return (
        <>
            <PageHeader
                title="Grab-box"
                actions={
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/guidelines#grab-box">Rules</Link>
                    </Button>
                }
            />
            <ActiveClaimBanner />
            <Toolbar
                trailing={
                    shots.data === undefined ? undefined : (
                        <span className="text-muted-foreground text-xs">{shots.data.meta.total} tasks</span>
                    )
                }
            >
                <Select
                    value={status}
                    onValueChange={(value) => {
                        setStatus(value as ShotStatus | typeof anyValue);
                        setPage(1);
                    }}
                >
                    <SelectTrigger size="sm" className="w-36" aria-label="Status">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any status</SelectItem>
                        {Object.values(ShotStatus).map((item) => (
                            <SelectItem key={item} value={item}>
                                {shotStatusLabels[item]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={difficulty}
                    onValueChange={(value) => {
                        setDifficulty(value as DifficultyTier | typeof anyValue);
                        setPage(1);
                    }}
                >
                    <SelectTrigger size="sm" className="w-36" aria-label="Difficulty">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={anyValue}>Any difficulty</SelectItem>
                        {Object.values(DifficultyTier).map((item) => (
                            <SelectItem key={item} value={item}>
                                {difficultyLabels[item]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    aria-label="Scene"
                    inputMode="numeric"
                    placeholder="Scene"
                    value={scene}
                    maxLength={6}
                    className="h-8 w-24"
                    onChange={(event) => {
                        setScene(event.target.value.replace(/\D/gu, ""));
                        setPage(1);
                    }}
                />
            </Toolbar>
            {shots.isPending ? (
                <LoadingCards count={8} />
            ) : shots.isError ? (
                <ErrorState error={shots.error} onRetry={() => void shots.refetch()} />
            ) : shots.data.data.length === 0 ? (
                <EmptyState title="No tasks" />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {shots.data.data.map((shot) => (
                            <ShotCard key={shot.id} shot={shot} />
                        ))}
                    </div>
                    <Pagination meta={shots.data.meta} onPageChange={setPage} />
                </>
            )}
        </>
    );
}
