"use client";

import { legalDocumentSlugs, Role, type DocumentDto, type DocumentSlug } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { platformApi } from "@/Api/PlatformApi";
import { queryKeys } from "@/Api/QueryKeys";
import { PageHeader } from "@/Components/Common/PageHeader";
import { ErrorState, LoadingRows } from "@/Components/Common/States";
import { Button } from "@/Components/Ui/button";
import { useSession } from "@/Hooks/UseSession";
import { formatDate } from "@/Lib/Format";
import { hasAtLeast } from "@/Lib/Roles";
import { cn } from "@/Lib/Utils";
import { documentNames, documentPaths, editorPath } from "./DocumentLinks";

export function DocumentSections({ document }: { readonly document: Pick<DocumentDto, "sections"> }): ReactNode {
    return (
        <article className="max-w-[70ch] space-y-12 min-w-0 w-full">
            {document.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-20 space-y-4 min-w-0">
                    <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
                    <div className="doc-prose" dangerouslySetInnerHTML={{ __html: section.html }} />
                </section>
            ))}
        </article>
    );
}

function Contents({ document }: { readonly document: DocumentDto }): ReactNode {
    const isLegal = legalDocumentSlugs.includes(document.slug);
    return (
        <nav aria-label="On this page" className="hidden space-y-6 lg:block">
            <div className="sticky top-20 space-y-6">
                {isLegal && (
                    <ul className="space-y-1.5 text-sm">
                        {legalDocumentSlugs.map((slug) => (
                            <li key={slug}>
                                <Link
                                    href={documentPaths[slug]}
                                    className={cn(
                                        "hover:text-foreground transition-colors",
                                        slug === document.slug ? "text-foreground font-medium" : "text-muted-foreground"
                                    )}
                                >
                                    {documentNames[slug]}
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
                <ol className={cn("space-y-2 text-xs", isLegal && "border-l pl-3")}>
                    {document.sections.map((section, index) => (
                        <li key={section.id}>
                            <a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground flex gap-2 transition-colors">
                                <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                                {section.title}
                            </a>
                        </li>
                    ))}
                </ol>
            </div>
        </nav>
    );
}

export function DocumentView({ slug }: { readonly slug: DocumentSlug }): ReactNode {
    const { user } = useSession();
    const document = useQuery({ queryKey: queryKeys.document(slug), queryFn: () => platformApi.document(slug) });

    if (document.isPending) {
        return <LoadingRows rows={6} />;
    }
    if (document.isError) {
        return <ErrorState error={document.error} onRetry={() => void document.refetch()} />;
    }
    const data = document.data;
    return (
        <>
            <PageHeader
                title={data.title}
                description={data.updatedAt === null ? undefined : `Updated ${formatDate(data.updatedAt)}`}
                actions={
                    hasAtLeast(user, Role.SuperAdmin) ? (
                        <Button asChild size="sm" variant="outline">
                            <Link href={editorPath(slug)}>
                                <Pencil />
                                Edit
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
            <div className="grid gap-10 lg:grid-cols-[12rem_1fr] min-w-0">
                <Contents document={data} />
                <DocumentSections document={data} />
            </div>
        </>
    );
}
