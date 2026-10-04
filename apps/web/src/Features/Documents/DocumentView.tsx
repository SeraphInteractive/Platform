"use client";

import { DocumentSlug, legalDocumentSlugs, Role, type DocumentDto } from "@platform/contracts";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import bannerImage from "@/Assets/project-stairway-what-is-it.png";
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

function MobileContents({ document }: { readonly document: DocumentDto }): ReactNode {
    const isLegal = legalDocumentSlugs.includes(document.slug);
    return (
        <nav aria-label="On this page" className="lg:hidden rounded-md border bg-muted/20 p-3 mb-6 space-y-3">
            {isLegal && (
                <div className="flex flex-wrap gap-1.5 border-b pb-2 text-xs">
                    {legalDocumentSlugs.map((slug) => (
                        <Link
                            key={slug}
                            href={documentPaths[slug]}
                            className={cn(
                                "rounded px-2 py-0.5 transition-colors",
                                slug === document.slug ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {documentNames[slug]}
                        </Link>
                    ))}
                </div>
            )}
            <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground list-none flex items-center justify-between">
                    <span>On this page ({document.sections.length} sections)</span>
                    <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-180">▼</span>
                </summary>
                <ol className="mt-2.5 space-y-2 text-xs border-t pt-2">
                    {document.sections.map((section, index) => (
                        <li key={section.id}>
                            <a href={`#${section.id}`} className="text-muted-foreground hover:text-foreground flex gap-2 transition-colors">
                                <span className="tabular-nums font-mono">{String(index + 1).padStart(2, "0")}</span>
                                <span>{section.title}</span>
                            </a>
                        </li>
                    ))}
                </ol>
            </details>
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
    const isGuidelines = slug === DocumentSlug.Guidelines;

    return (
        <>
            {isGuidelines ? (
                <div className="relative mb-6 flex flex-col items-center justify-center pt-2">
                    {hasAtLeast(user, Role.SuperAdmin) && (
                        <div className="absolute right-0 top-0">
                            <Button asChild size="sm" variant="outline">
                                <Link href={editorPath(slug)}>
                                    <Pencil />
                                    Edit
                                </Link>
                            </Button>
                        </div>
                    )}
                    <Image
                        src={bannerImage}
                        alt="Project Stairway"
                        priority
                        className="h-auto w-full max-w-md sm:max-w-lg md:max-w-2xl select-none"
                    />
                </div>
            ) : (
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
            )}
            <div className="grid gap-10 lg:grid-cols-[12rem_1fr] min-w-0">
                <Contents document={data} />
                <div className="min-w-0 w-full">
                    <MobileContents document={data} />
                    <DocumentSections document={data} />
                </div>
            </div>
        </>
    );
}
