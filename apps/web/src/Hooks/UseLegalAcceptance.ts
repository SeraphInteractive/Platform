"use client";

import { useQuery } from "@tanstack/react-query";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { useSession } from "./UseSession";

export interface LegalAcceptanceState {
    readonly version: string | null;
    readonly needsAcceptance: boolean;
}

export function useLegalAcceptance(): LegalAcceptanceState {
    const { user } = useSession();
    const acceptance = useQuery({
        queryKey: queryKeys.legalAcceptance,
        queryFn: () => platformApi.legalAcceptance(),
        enabled: user !== null,
        staleTime: 60_000
    });
    const version = acceptance.data ?? null;
    return { version, needsAcceptance: user !== null && version !== null && user.termsVersion !== version };
}
