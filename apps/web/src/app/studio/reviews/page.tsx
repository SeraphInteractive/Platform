import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReviewsPage } from "@/Features/Studio/ReviewsPage";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPageRoute(): ReactNode {
    return <ReviewsPage />;
}
