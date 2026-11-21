import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AgreementsPage } from "@/Features/Studio/AgreementsPage";

export const metadata: Metadata = { title: "Agreements" };

export default function AgreementsPageRoute(): ReactNode {
    return <AgreementsPage />;
}
