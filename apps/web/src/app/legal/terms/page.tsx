import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocumentSlug } from "@platform/contracts";
import { DocumentView } from "@/Features/Documents/DocumentView";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage(): ReactNode {
    return <DocumentView slug={DocumentSlug.Terms} />;
}
