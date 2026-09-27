import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RoadmapView } from "@/Features/Roadmap/RoadmapView";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage(): ReactNode {
    return <RoadmapView />;
}
