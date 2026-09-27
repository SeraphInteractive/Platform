import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocumentSlug } from "@platform/contracts";
import { DocumentView } from "@/Features/Documents/DocumentView";

export const metadata: Metadata = { title: "Acceptable Use Policy" };

export default function AcceptableUsePage(): ReactNode {
    return <DocumentView slug={DocumentSlug.AcceptableUse} />;
}
