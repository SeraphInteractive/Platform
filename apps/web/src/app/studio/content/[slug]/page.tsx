import { DocumentSlug } from "@platform/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DocumentEditor } from "@/Features/Documents/DocumentEditor";

export const metadata: Metadata = { title: "Edit content" };

const slugs: readonly string[] = Object.values(DocumentSlug);

export default async function DocumentEditorPage({ params }: PageProps<"/studio/content/[slug]">): Promise<ReactNode> {
    const { slug } = await params;
    if (!slugs.includes(slug)) {
        notFound();
    }
    return <DocumentEditor slug={slug as DocumentSlug} />;
}
