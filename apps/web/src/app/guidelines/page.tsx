import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GuidelinesView } from "@/Features/Guidelines/GuidelinesView";

export const metadata: Metadata = { title: "Guidelines" };

export default function GuidelinesPage(): ReactNode {
    return <GuidelinesView />;
}
