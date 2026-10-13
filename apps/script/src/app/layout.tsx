import type { Metadata } from "next";
import { Courier_Prime, Nunito } from "next/font/google";
import "./globals.css";

const courierPrime = Courier_Prime({
    weight: ["400", "700"],
    subsets: ["latin"],
    variable: "--font-courier-prime",
    display: "swap"
});

const nunito = Nunito({
    weight: ["300", "400", "500", "600", "700", "800"],
    subsets: ["latin"],
    variable: "--font-nunito",
    display: "swap"
});

export const metadata: Metadata = {
    title: "Studio",
    description: "Studio screenplay editor and story development platform for Project Stairway."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`dark ${courierPrime.variable} ${nunito.variable}`} suppressHydrationWarning>
            <body
                suppressHydrationWarning
                className="antialiased min-h-screen bg-[#0b0d13] text-slate-100 selection:bg-blue-600 selection:text-white"
            >
                {children}
            </body>
        </html>
    );
}
