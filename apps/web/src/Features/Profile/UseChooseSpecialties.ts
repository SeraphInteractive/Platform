"use client";

import type { Specialty, UserDto } from "@platform/contracts";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";

export function useChooseSpecialties(): UseMutationResult<UserDto, Error, readonly Specialty[]> {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (specialties: readonly Specialty[]) => platformApi.chooseSpecialties(specialties),
        onSuccess: (user) => {
            queryClient.setQueryData(queryKeys.me, user);
        },
        onError: (error) => {
            toast.error(describeError(error));
        }
    });
}
