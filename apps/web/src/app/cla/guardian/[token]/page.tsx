import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GuardianView } from "@/Features/Cla/GuardianView";

export const metadata: Metadata = { title: "Guardian consent", referrer: "no-referrer", robots: { index: false, follow: false } };

export default async function GuardianConsentPage({ params }: PageProps<"/cla/guardian/[token]">): Promise<ReactNode> {
    const { token } = await params;
    return <GuardianView token={token} />;
}
