import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { FeedbackSubjectView } from "@/Features/Studio/Feedback/FeedbackSubjectView";

export const metadata: Metadata = { title: "Crew feedback" };

export default async function FeedbackSubjectRoute({ params }: PageProps<"/studio/feedback/[subjectId]">): Promise<ReactNode> {
    const { subjectId } = await params;
    if (!z.uuid().safeParse(subjectId).success) {
        notFound();
    }
    return <FeedbackSubjectView subjectId={subjectId} />;
}
