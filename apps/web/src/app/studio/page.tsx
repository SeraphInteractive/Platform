import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardPage } from "@/Features/Studio/DashboardPage";

export const metadata: Metadata = { title: "Studio" };

export default function DashboardPageRoute(): ReactNode {
    return <DashboardPage />;
}
