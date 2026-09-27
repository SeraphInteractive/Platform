import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { RoundPage } from "@/Features/Studio/RoundPage";

export const metadata: Metadata = { title: "Round" };

export default async function StudioRoundRoute({ params }: PageProps<"/studio/rounds/[roundId]">): Promise<ReactNode> {
    const { roundId } = await params;
    if (!z.uuid().safeParse(roundId).success) {
        notFound();
    }
    return <RoundPage roundId={roundId} />;
}
