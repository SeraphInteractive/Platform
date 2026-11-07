import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { shotCodeSchema } from "@platform/contracts";
import { ShotView } from "@/Features/Grabbox/ShotView";

export const metadata: Metadata = { title: "Task" };

const taskParamSchema = z.union([z.uuid(), shotCodeSchema]);

export default async function ShotPage({ params }: PageProps<"/grabbox/[shotId]">): Promise<ReactNode> {
    const { shotId } = await params;
    if (!taskParamSchema.safeParse(shotId).success) {
        notFound();
    }
    return <ShotView shotId={shotId} />;
}
