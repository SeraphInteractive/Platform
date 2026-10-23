import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PositionsView } from "@/Features/Positions/PositionsView";

export const metadata: Metadata = { title: "Positions" };

export default function PositionsPage(): ReactNode {
    return <PositionsView />;
}
