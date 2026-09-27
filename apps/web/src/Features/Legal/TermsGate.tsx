"use client";

import { legalDocumentSlugs } from "@platform/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { describeError } from "@/Api/ApiClient";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { Button } from "@/Components/Ui/button";
import { Checkbox } from "@/Components/Ui/checkbox";
import { documentNames, documentPaths } from "@/Features/Documents/DocumentLinks";
import { useLegalAcceptance } from "@/Hooks/UseLegalAcceptance";
import { useLogout, useSession } from "@/Hooks/UseSession";

function Acceptance({ version, isUpdate }: { readonly version: string; readonly isUpdate: boolean }): ReactNode {
    const queryClient = useQueryClient();
    const logout = useLogout();
    const [agreed, setAgreed] = useState(false);
    const accept = useMutation({
        mutationFn: () => platformApi.acceptTerms(version),
        onSuccess: (user) => {
            queryClient.setQueryData(queryKeys.me, user);
        },
        onError: (error) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.legalAcceptance });
            toast.error(describeError(error));
        }
    });

    return (
        <div className="mx-auto max-w-md space-y-6 py-12">
            <div className="space-y-1">
                <h1 className="text-lg font-semibold">{isUpdate ? "We've updated our terms" : "Before you continue"}</h1>
                <p className="text-muted-foreground text-sm">
                    {isUpdate ? "Review the changes and accept to keep using the site." : "Review and accept these to use the site."}
                </p>
            </div>
            <ul className="divide-y border">
                {legalDocumentSlugs.map((slug) => (
                    <li key={slug}>
                        <Link href={documentPaths[slug]} className="hover:bg-accent/50 flex justify-between px-4 py-3 text-sm">
                            {documentNames[slug]}
                            <span className="text-muted-foreground">Read</span>
                        </Link>
                    </li>
                ))}
            </ul>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                    className="mt-0.5"
                    checked={agreed}
                    onCheckedChange={(value) => {
                        setAgreed(value === true);
                    }}
                />
                I have read and agree to the Terms of Service, Privacy Policy and Acceptable Use Policy.
            </label>
            <div className="flex gap-2">
                <Button
                    className="flex-1"
                    disabled={!agreed || accept.isPending}
                    onClick={() => {
                        accept.mutate();
                    }}
                >
                    {accept.isPending ? "Saving…" : "Accept and continue"}
                </Button>
                <Button
                    variant="outline"
                    disabled={logout.isPending}
                    onClick={() => {
                        logout.mutate();
                    }}
                >
                    Sign out
                </Button>
            </div>
        </div>
    );
}

export function TermsGate({ children }: { readonly children: ReactNode }): ReactNode {
    const pathname = usePathname();
    const { user } = useSession();
    const { version, needsAcceptance } = useLegalAcceptance();
    if (!needsAcceptance || version === null || user === null || pathname.startsWith("/legal")) {
        return children;
    }
    return <Acceptance version={version} isUpdate={user.termsVersion !== null} />;
}
