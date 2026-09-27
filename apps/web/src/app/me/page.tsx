import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MeView } from "@/Features/Me/MeView";

export const metadata: Metadata = { title: "My work" };

export default function MePage(): ReactNode {
    return <MeView />;
}
