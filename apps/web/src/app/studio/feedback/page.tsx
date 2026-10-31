import type { Metadata } from "next";
import type { ReactNode } from "react";
import { FeedbackPage } from "@/Features/Studio/Feedback/FeedbackPage";

export const metadata: Metadata = { title: "Crew feedback" };

export default function FeedbackPageRoute(): ReactNode {
    return <FeedbackPage />;
}
