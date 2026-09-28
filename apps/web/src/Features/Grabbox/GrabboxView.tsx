"use client";

import { DifficultyTier, Role, ShotStatus } from "@platform/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { platformApi, type ShotQuery } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { DataList, DataRow, Toolbar } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { Pagination } from "@/Components/Common/Pagination";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { EmptyState, ErrorState, LoadingRows } from "@/Components/Common/States";
import { ShotStatusBadge } from "@/Components/Common/StatusBadge";
import { Button } from "@/Components/Ui/button";
import { Input } from "@/Components/Ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/Ui/select";
import { useSession } from "@/Hooks/UseSession";
import { difficultyLabels, shotStatusLabels } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { ClaimantText, SeniorLock } from "./ShotMeta";
import { useMyShots } from "./UseMyShots";

const anyValue = "any";
const shotIdSchema = z.uuid();

function ActiveClaimBanner(): ReactNode {
    const { user } = useSession();
    const myShots = useMyShots(user !== null && hasAtLeast(user, Role.Contributor) ? user.id : null);
    const active = myShots.active;
    if (active === null) {
        return null;
    }
    return (
        <div className="border-primary/40 bg-primary/5 mb-3 flex items-center gap-3 rounded-md border px-3 py-2">
            <span className="text-primary text-xs font-semibold">Your task</span>
            <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground font-mono text-xs">{active.shotCode}</span> {active.title}
            </span>
            {active.deadlineAt !== null && (
                <span className="text-muted-foreground hidden text-xs sm:inline">
                    <RelativeTime value={active.deadlineAt} prefix="due" />
                </span>
            )}
            <Button asChild size="xs">
                <Link href={`/grabbox/${active.id}` as Route}>Open</Link>
            </Button>
        </div>
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

    const [status, setStatus] = useState<ShotStatus | typeof anyValue>(ShotStatus.Available);
    const [difficulty, setDifficulty] = useState<DifficultyTier | typeof anyValue>(anyValue);
    const [scene, setScene] = useState("");
    const [page, setPage] = useState(1);

    const sceneNumber = /^\d{1,6}$/u.test(scene) && Number(scene) > 0 ? Number(scene) : undefined;
    const query: ShotQuery = {
        page,
        perPage: 25,
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
                <LoadingRows rows={6} />
            ) : shots.isError ? (
                <ErrorState error={shots.error} onRetry={() => void shots.refetch()} />
            ) : shots.data.data.length === 0 ? (
                <EmptyState title="No tasks" />
            ) : (
                <>
                    <DataList>
                        {shots.data.data.map((shot) => (
                            <DataRow
                                key={shot.id}
                                href={`/grabbox/${shot.id}` as Route}
                                thumbnail={
                                    shot.imageUrls.length > 0 ? (
                                        <img src={shot.imageUrls[0]} alt="" className="size-full object-cover" loading="lazy" />
                                    ) : undefined
                                }
                                code={shot.shotCode}
                                title={shot.title}
                                meta={
                                    shot.claimer !== null ? (
                                        <ClaimantText shot={shot} />
                                    ) : shot.isSeniorLocked ? (
                                        <SeniorLock shot={shot} />
                                    ) : (
                                        `Scene ${String(shot.sceneNumber)}`
                                    )
                                }
                                fields={
                                    <>
                                        <span className="text-muted-foreground w-24 text-right text-xs">
                                            {difficultyLabels[shot.difficultyTier]} · {shot.tierDays}d
                                        </span>
                                        <ShotStatusBadge status={shot.status} />
                                    </>
                                }
                            />
                        ))}
                    </DataList>
                    <Pagination meta={shots.data.meta} onPageChange={setPage} />
                </>
            )}
        </>
    );
}
