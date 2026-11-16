import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { TicketDetailView } from "@/Features/Studio/Tickets/TicketDetailView";

export const metadata: Metadata = { title: "Ticket" };

export default async function StudioTicketRoute({ params }: PageProps<"/studio/tickets/[ticketId]">): Promise<ReactNode> {
    const { ticketId } = await params;
    if (!z.uuid().safeParse(ticketId).success) {
        notFound();
    }
    return <TicketDetailView ticketId={ticketId} />;
}
