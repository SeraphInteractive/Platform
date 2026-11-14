import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
    title: "Project Stairway",
    description: "A community-made Minecraft animated film."
};

export const viewport: Viewport = {
    themeColor: "#090a0f"
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
    return (
        <html lang="en">
            <body className="min-h-dvh antialiased">{children}</body>
        </html>
    );
}
