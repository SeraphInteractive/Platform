"use client";

import { EntryStatus, Role, RoundStatus, ShotStatus, type RoundDto } from "@platform/contracts";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { DataList, DataRow } from "@/Components/Common/DataList";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { Section } from "@/Components/Common/Section";
import { StatTile } from "@/Components/Common/StatTile";
import { LoadingRows, RequireRole } from "@/Components/Common/States";
import { RoundStatusBadge, Tone, ToneBadge } from "@/Components/Common/StatusBadge";
import { useNow } from "@/Hooks/UseNow";
import { useSession } from "@/Hooks/UseSession";
import { hasAtLeast } from "@/Lib/Roles";

function useActiveRounds(): { readonly rounds: readonly RoundDto[]; readonly isPending: boolean } {
    const results = useQueries({
        queries: [RoundStatus.Open, RoundStatus.Draft].map((status) => {
            const query = { status, page: 1, perPage: 100 };
            return { queryKey: queryKeys.rounds(query), queryFn: () => platformApi.rounds(query) };
        })
    });
    return { rounds: results.flatMap((result) => result.data?.data ?? []), isPending: results.some((result) => result.isPending) };
}

function usePendingEntries(rounds: readonly RoundDto[]): ReadonlyMap<string, number> {
    const results = useQueries({
        queries: rounds.map((round) => {
            const query = { status: EntryStatus.PendingReview, page: 1, perPage: 1 };
            return { queryKey: queryKeys.entries(round.id, query), queryFn: () => platformApi.entries(round.id, query) };
        })
    });
    return new Map(rounds.map((round, index) => [round.id, results[index]?.data?.meta.total ?? 0]));
}

function Dashboard(): ReactNode {
    const { user } = useSession();
    const now = useNow(60_000);
    const isSupervisor = hasAtLeast(user, Role.Supervisor);
    const active = useActiveRounds();
    const pending = usePendingEntries(active.rounds);
    const pendingTotal = [...pending.values()].reduce((sum, count) => sum + count, 0);
    const reviewsQuery = { page: 1, perPage: 5 };
    const reviews = useQuery({
        queryKey: queryKeys.reviewQueue(reviewsQuery),
        queryFn: () => platformApi.reviewQueue(reviewsQuery),
        enabled: isSupervisor
    });
    const claimedQuery = { status: ShotStatus.Claimed, page: 1, perPage: 100 };
    const claimed = useQuery({ queryKey: queryKeys.shots(claimedQuery), queryFn: () => platformApi.shots(claimedQuery) });
    const availableQuery = { status: ShotStatus.Available, page: 1, perPage: 1 };
    const available = useQuery({ queryKey: queryKeys.shots(availableQuery), queryFn: () => platformApi.shots(availableQuery) });
    const overdue = (claimed.data?.data ?? []).filter((shot) => shot.deadlineAt !== null && new Date(shot.deadlineAt).getTime() < now);
    const openRounds = active.rounds.filter((round) => round.status === RoundStatus.Open);
    const roundsNeedingReview = active.rounds.filter((round) => (pending.get(round.id) ?? 0) > 0);

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <StatTile
                    label="Entries to review"
                    value={active.isPending ? "–" : pendingTotal}
                    href="/studio/rounds"
                    emphasis={pendingTotal > 0}
                />
                {isSupervisor && (
                    <StatTile
                        label="Submissions to review"
                        value={reviews.data?.meta.total ?? "–"}
                        href="/studio/reviews"
                        emphasis={(reviews.data?.meta.total ?? 0) > 0}
                    />
                )}
                <StatTile label="Open rounds" value={active.isPending ? "–" : openRounds.length} href="/studio/rounds" />
                <StatTile
                    label="Overdue claims"
                    value={claimed.isPending ? "–" : overdue.length}
                    href="/studio/tasks"
                    emphasis={overdue.length > 0}
                />
                <StatTile label="Available tasks" value={available.data?.meta.total ?? "–"} href="/grabbox" />
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
                <Section title="Entries awaiting review">
                    {active.isPending ? (
                        <LoadingRows rows={2} />
                    ) : roundsNeedingReview.length === 0 ? (
                        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">Nothing pending</p>
                    ) : (
                        <DataList>
                            {roundsNeedingReview.map((round) => (
                                <DataRow
                                    key={round.id}
                                    href={`/studio/rounds/${round.id}` as Route}
                                    title={round.title}
                                    fields={
                                        <>
                                            <ToneBadge tone={Tone.Warning}>{pending.get(round.id)} pending</ToneBadge>
                                            <RoundStatusBadge status={round.status} />
                                        </>
                                    }
                                />
                            ))}
                        </DataList>
                    )}
                </Section>
                {isSupervisor && (
                    <Section title="Oldest submissions">
                        {reviews.isPending ? (
                            <LoadingRows rows={2} />
                        ) : (reviews.data?.data.length ?? 0) === 0 ? (
                            <p className="text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center">Queue is empty</p>
                        ) : (
                            <DataList>
                                {reviews.data?.data.map((item) => (
                                    <DataRow
                                        key={item.id}
                                        href="/studio/reviews"
                                        code={item.shot.shotCode}
                                        title={item.shot.title}
                                        meta={`v${String(item.version)} · ${item.contributor?.username ?? "Unknown"}`}
                                        fields={
                                            <span className="text-muted-foreground text-xs">
                                                <RelativeTime value={item.createdAt} />
                                            </span>
                                        }
                                    />
                                ))}
                            </DataList>
                        )}
                    </Section>
                )}
                {overdue.length > 0 && (
                    <Section title="Overdue claims">
                        <DataList>
                            {overdue.map((shot) => (
                                <DataRow
                                    key={shot.id}
                                    href={`/grabbox/${shot.id}` as Route}
                                    code={shot.shotCode}
                                    title={shot.title}
                                    meta={shot.claimer?.username}
                                    fields={
                                        shot.deadlineAt === null ? undefined : (
                                            <span className="text-destructive text-xs">
                                                <RelativeTime value={shot.deadlineAt} prefix="due" />
                                            </span>
                                        )
                                    }
                                />
                            ))}
                        </DataList>
                    </Section>
                )}
            </div>
        </div>
    );
}

export function DashboardPage(): ReactNode {
    return (
        <RequireRole role={Role.Moderator}>
            <PageHeader title="Studio" />
            <Dashboard />
        </RequireRole>
    );
}
