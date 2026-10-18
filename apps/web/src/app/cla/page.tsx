import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClaView } from "@/Features/Cla/ClaView";

export const metadata: Metadata = { title: "Contributor License Agreement" };

export default function ClaPage(): ReactNode {
    return <ClaView />;
}
