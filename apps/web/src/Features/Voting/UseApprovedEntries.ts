"use client";

import { EntryStatus, PollType, Role, type EntryDto, type UserDto } from "@platform/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { hasAtLeast } from "@/Lib/Roles";

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

export function hasSubmittedEntry(
    user: UserDto | null,
    roundId: string,
    approvedEntries?: readonly EntryDto[],
    myEntries?: readonly EntryDto[]
): boolean {
    if (user === null || hasAtLeast(user, Role.Admin)) {
        return false;
    }
    const hasApproved = approvedEntries?.some((e) => e.submittedBy === user.id) ?? false;
    const hasPendingOrApproved =
        myEntries?.some((e) => e.roundId === roundId && (e.status === EntryStatus.PendingReview || e.status === EntryStatus.Approved)) ??
        false;
    return hasApproved || hasPendingOrApproved;
}

export function useApprovedEntries(roundId: string): UseQueryResult<EntryDto[]> {
    return useQuery({
        queryKey: queryKeys.approvedEntries(roundId),
        queryFn: () => fetchApprovedEntries(roundId)
    });
}
