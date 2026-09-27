"use client";

import { ShotStatus, type ShotDto } from "@platform/contracts";
import { useQueries } from "@tanstack/react-query";
import { platformApi, type ShotQuery } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";

export interface MyShots {
    readonly active: ShotDto | null;
    readonly submitted: readonly ShotDto[];
    readonly approved: readonly ShotDto[];
    readonly isPending: boolean;
    readonly error: Error | null;
    readonly refetch: () => void;
}

const trackedStatuses = [ShotStatus.Claimed, ShotStatus.Submitted, ShotStatus.Approved] as const;

export function useMyShots(userId: string | null): MyShots {
    const results = useQueries({
        queries: trackedStatuses.map((status) => {
            const query: ShotQuery = { status, page: 1, perPage: 100 };
            return {
                queryKey: queryKeys.shots(query),
                queryFn: () => platformApi.shots(query),
                enabled: userId !== null
            };
        })
    });
    const mine = (index: number): ShotDto[] => (results[index]?.data?.data ?? []).filter((shot) => shot.claimer?.id === userId);
    return {
        active: mine(0)[0] ?? null,
        submitted: mine(1),
        approved: mine(2),
        isPending: userId !== null && results.some((result) => result.isPending),
        error: results.find((result) => result.error !== null)?.error ?? null,
        refetch: () => {
            for (const result of results) {
                void result.refetch();
            }
        }
    };
}
