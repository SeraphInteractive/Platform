import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ContentPage } from "@/Features/Documents/ContentPage";

export const metadata: Metadata = { title: "Content" };

export default function ContentPageRoute(): ReactNode {
    return <ContentPage />;
}
