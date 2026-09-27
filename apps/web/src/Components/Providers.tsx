"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, describeError } from "@/Api/ApiClient";
import { queryKeys } from "@/Api/QueryKeys";
import { Toaster } from "@/Components/Ui/sonner";
import { TooltipProvider } from "@/Components/Ui/tooltip";

interface ProvidersProps {
    readonly nonce: string | undefined;
    readonly children: ReactNode;
}

function shouldRetry(failureCount: number, error: unknown): boolean {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false;
    }
    return failureCount < 2;
}

function createQueryClient(): QueryClient {
    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({
            onError: (error) => {
                if (error instanceof ApiError && error.status === 401) {
                    client.setQueryData(queryKeys.me, null);
                }
            }
        }),
        mutationCache: new MutationCache({
            onError: (error, _variables, _context, mutation) => {
                if (error instanceof ApiError && error.status === 401) {
                    client.setQueryData(queryKeys.me, null);
                }
                if (mutation.options.onError === undefined) {
                    toast.error(describeError(error));
                }
            }
        }),
        defaultOptions: {
            queries: { staleTime: 15_000, retry: shouldRetry, refetchOnWindowFocus: true },
            mutations: { retry: false }
        }
    });
    return client;
}

export function Providers({ nonce, children }: ProvidersProps): ReactNode {
    const [queryClient] = useState(createQueryClient);
    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange nonce={nonce}>
            <QueryClientProvider client={queryClient}>
                <TooltipProvider delayDuration={200}>
                    {children}
                    <Toaster position="bottom-right" />
                </TooltipProvider>
            </QueryClientProvider>
        </ThemeProvider>
    );
}
