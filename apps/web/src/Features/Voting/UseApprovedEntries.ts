"use client";

import { EntryStatus, PollType, type EntryDto } from "@platform/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";

const maximumPages = 20;

export const requiredPicks: Readonly<Record<PollType, number>> = {
    [PollType.RankedChoice]: 3,
    [PollType.Binary]: 1
};

async function fetchApprovedEntries(roundId: string): Promise<EntryDto[]> {
    const collected: EntryDto[] = [];
    for (let page = 1; page <= maximumPages; page++) {
        const result = await platformApi.entries(roundId, { page, perPage: 100, status: EntryStatus.Approved });
        collected.push(...result.data);
        if (page >= result.meta.totalPages) {
            break;
        }
    }
    return collected;
}

export function isEligible(entry: EntryDto): boolean {
    return entry.status === EntryStatus.Approved && !entry.isQuarantined;
}

export function useApprovedEntries(roundId: string): UseQueryResult<EntryDto[]> {
    return useQuery({
        queryKey: queryKeys.approvedEntries(roundId),
        queryFn: () => fetchApprovedEntries(roundId)
    });
}
