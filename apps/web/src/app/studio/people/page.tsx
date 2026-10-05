import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PeoplePage } from "@/Features/Studio/PeoplePage";

export const metadata: Metadata = { title: "People" };

export default function PeoplePageRoute(): ReactNode {
    return <PeoplePage />;
}
