import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TicketsPage } from "@/Features/Studio/Tickets/TicketsPage";

export const metadata: Metadata = { title: "Tickets" };

export default function TicketsPageRoute(): ReactNode {
    return <TicketsPage />;
}
