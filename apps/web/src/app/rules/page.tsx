import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocumentSlug } from "@platform/contracts";
import { DocumentView } from "@/Features/Documents/DocumentView";

export const metadata: Metadata = { title: "Discord Rules" };

export default function RulesPage(): ReactNode {
    return <DocumentView slug={DocumentSlug.Rules} />;
}
