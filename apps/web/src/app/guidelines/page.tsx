import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocumentSlug } from "@platform/contracts";
import { DocumentView } from "@/Features/Documents/DocumentView";

export const metadata: Metadata = { title: "Guidelines" };

export default function GuidelinesPage(): ReactNode {
    return <DocumentView slug={DocumentSlug.Guidelines} />;
}
