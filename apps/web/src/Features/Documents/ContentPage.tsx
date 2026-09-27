"use client";

import { DocumentSlug, Role } from "@platform/contracts";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { RelativeTime } from "@/Components/Common/RelativeTime";
import { RequireRole } from "@/Components/Common/States";
import { Button } from "@/Components/Ui/button";
import { documentNames, documentPaths, editorPath } from "./DocumentLinks";

const slugs = Object.values(DocumentSlug);

function ContentList(): ReactNode {
    const documents = useQueries({
        queries: slugs.map((slug) => ({ queryKey: queryKeys.document(slug), queryFn: () => platformApi.document(slug) }))
    });
    return (
        <ul className="divide-y border">
            {slugs.map((slug, index) => {
                const document = documents[index]?.data;
                return (
                    <li key={slug} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">{documentNames[slug]}</p>
                            <p className="text-muted-foreground text-xs">
                                {document === undefined ? (
                                    "Loading…"
                                ) : document.updatedAt === null ? (
                                    "Default content, not published yet"
                                ) : (
                                    <>
                                        Revision {document.revision} · {document.updatedBy?.username ?? "Unknown"} ·{" "}
                                        <RelativeTime value={document.updatedAt} />
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button asChild size="sm" variant="ghost">
                                <Link href={documentPaths[slug]}>View</Link>
                            </Button>
                            <Button asChild size="sm">
                                <Link href={editorPath(slug)}>Edit</Link>
                            </Button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export function ContentPage(): ReactNode {
    return (
        <RequireRole role={Role.SuperAdmin}>
            <PageHeader title="Content" />
            <ContentList />
        </RequireRole>
    );
}
