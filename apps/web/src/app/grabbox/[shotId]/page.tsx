import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { ShotView } from "@/Features/Grabbox/ShotView";

export const metadata: Metadata = { title: "Task" };

export default async function ShotPage({ params }: PageProps<"/grabbox/[shotId]">): Promise<ReactNode> {
    const { shotId } = await params;
    if (!z.uuid().safeParse(shotId).success) {
        notFound();
    }
    return <ShotView shotId={shotId} />;
}
