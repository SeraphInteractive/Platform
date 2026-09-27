import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RoundsPage } from "@/Features/Studio/RoundsPage";

export const metadata: Metadata = { title: "Rounds" };

export default function RoundsPageRoute(): ReactNode {
    return <RoundsPage />;
}
