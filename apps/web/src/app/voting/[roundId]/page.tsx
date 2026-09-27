import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { RoundView } from "@/Features/Voting/RoundView";

export const metadata: Metadata = { title: "Round" };

export default async function RoundPage({ params }: PageProps<"/voting/[roundId]">): Promise<ReactNode> {
    const { roundId } = await params;
    if (!z.uuid().safeParse(roundId).success) {
        notFound();
    }
    return <RoundView roundId={roundId} />;
}
