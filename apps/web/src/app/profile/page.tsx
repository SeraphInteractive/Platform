import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProfileView } from "@/Features/Profile/ProfileView";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage(): ReactNode {
    return <ProfileView />;
}
