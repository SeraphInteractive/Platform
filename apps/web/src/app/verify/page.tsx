import type { Metadata } from "next";
import type { ReactNode } from "react";
import { VerifyView } from "@/Features/Verification/VerifyView";

export const metadata: Metadata = { title: "Verify" };

export default function VerifyPage(): ReactNode {
    return <VerifyView />;
}
