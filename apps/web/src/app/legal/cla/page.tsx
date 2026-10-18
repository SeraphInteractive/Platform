import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocumentSlug } from "@platform/contracts";
import { DocumentView } from "@/Features/Documents/DocumentView";

export const metadata: Metadata = { title: "Contributor License Agreement" };

export default function ClaDocumentPage(): ReactNode {
    return <DocumentView slug={DocumentSlug.Cla} />;
}
