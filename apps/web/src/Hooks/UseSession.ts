"use client";

import { dataEnvelope, userSchema, type UserDto } from "@platform/contracts";
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { ApiError } from "@/Api/ApiClient";
import { queryKeys } from "@/Api/QueryKeys";

export interface Session {
    readonly user: UserDto | null;
    readonly isLoading: boolean;
}

const sessionSchema = dataEnvelope(userSchema.nullable());

async function fetchCurrentUser(): Promise<UserDto | null> {
    const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    const parsed = sessionSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) {
        throw new ApiError(response.status, "SESSION_UNAVAILABLE", "Could not load your session.");
    }
    return parsed.data.data;
}

export function useSession(): Session {
    const query = useQuery({ queryKey: queryKeys.me, queryFn: fetchCurrentUser, staleTime: 60_000 });
    return { user: query.data ?? null, isLoading: query.isPending };
}

export function useLogout(): UseMutationResult<void, Error, void> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async () => {
            const response = await fetch("/api/session", { method: "DELETE", credentials: "same-origin" });
            if (!response.ok && response.status !== 204) {
                throw new ApiError(response.status, "LOGOUT_FAILED", "Could not sign out. Try again.");
            }
        },
        onSuccess: () => {
            queryClient.clear();
            queryClient.setQueryData(queryKeys.me, null);
        }
    });
}

export function loginHref(returnTo: string): string {
    return `/auth/login?${new URLSearchParams({ returnTo }).toString()}`;
}
