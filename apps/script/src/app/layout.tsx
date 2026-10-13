import type { Metadata } from "next";
import { Courier_Prime, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const courierPrime = Courier_Prime({
    weight: ["400", "700"],
    subsets: ["latin"],
    variable: "--font-courier-prime",
    display: "swap"
});

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-jetbrains",
    display: "swap"
});

export const metadata: Metadata = {
    title: "Studio · Project Stairway",
    description: "Studio screenplay editor and story development platform for Project Stairway."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable} ${courierPrime.variable}`} suppressHydrationWarning>
            <body
                suppressHydrationWarning
                className="antialiased min-h-screen bg-[#1a1c1f] text-zinc-100 selection:bg-[#4c8aec]/30 selection:text-white"
            >
                {children}
            </body>
        </html>
    );
}
