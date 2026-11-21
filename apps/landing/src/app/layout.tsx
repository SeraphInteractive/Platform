import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { DISCORD_URL, SITE_DESCRIPTION, SITE_TITLE, SITE_URL, YOUTUBE_URL } from "./content";
import { BackgroundMedia } from "./BackgroundMedia";
import { SiteChrome } from "./SiteChrome";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: `${SITE_TITLE}: a community-made Minecraft animated film`,
        template: `%s · ${SITE_TITLE}`
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_TITLE,
    keywords: [
        "Project Stairway",
        "Minecraft animation",
        "Minecraft movie",
        "community film",
        "Blender animation",
        "open animation project"
    ],
    alternates: { canonical: "/" },
    openGraph: {
        type: "website",
        url: "/",
        siteName: SITE_TITLE,
        title: `${SITE_TITLE}: a community effort`,
        description: SITE_DESCRIPTION,
        locale: "en_US",
        images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Project Stairway. A community effort." }]
    },
    twitter: {
        card: "summary_large_image",
        title: `${SITE_TITLE}: a community effort`,
        description: SITE_DESCRIPTION,
        images: ["/og-image.jpg"]
    },
    robots: { index: true, follow: true },
    icons: {
        icon: "/brand/logo.png",
        apple: "/brand/logo.png"
    }
};

export const viewport: Viewport = {
    themeColor: "#0b0d12",
    colorScheme: "dark"
};

const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: SITE_TITLE,
            url: SITE_URL,
            logo: `${SITE_URL}/brand/logo.png`,
            sameAs: [DISCORD_URL, YOUTUBE_URL]
        },
        {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_TITLE,
            description: SITE_DESCRIPTION,
            inLanguage: "en",
            publisher: { "@id": `${SITE_URL}/#organization` }
        }
    ]
};

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
    return (
        <html lang="en" className={inter.variable}>
            <body className="min-h-dvh font-sans antialiased">
                <a
                    href="#main"
                    className="focus-ring sr-only z-50 rounded-md bg-white px-4 py-2 text-sm font-semibold text-zinc-900 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
                >
                    Skip to content
                </a>
                <BackgroundMedia />
                <SiteChrome />
                {children}
                <script
                    type="application/ld+json"
                    // json-ld must be inline; escape "<" so the payload can never close the script tag
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
                />
            </body>
        </html>
    );
}
