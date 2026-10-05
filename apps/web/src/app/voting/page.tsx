import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RoundsView } from "@/Features/Voting/RoundsView";

export const metadata: Metadata = { title: "Voting" };

export default function VotingPage(): ReactNode {
    return <RoundsView />;
}
