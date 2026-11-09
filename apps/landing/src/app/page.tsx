import Image from "next/image";
import type { ReactNode } from "react";

export default function LandingPage(): ReactNode {
    return (
        <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-10 p-6 select-none">
            <div className="relative w-full max-w-2xl px-4">
                <Image
                    src="/logo.jpg"
                    alt="Project Stairway"
                    width={1920}
                    height={607}
                    priority
                    className="h-auto w-full object-contain drop-shadow-[0_0_40px_rgba(255,255,255,0.12)]"
                />
            </div>
            <a
                href="https://app.projectstairway.net"
                className="group relative inline-flex items-center justify-center rounded-lg bg-zinc-100 px-9 py-3.5 text-base font-semibold text-zinc-950 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all duration-300 hover:scale-105 hover:bg-white hover:shadow-[0_0_35px_rgba(255,255,255,0.55)] active:scale-95 focus:outline-none focus:ring-2 focus:ring-white/80"
            >
                register now!
            </a>
        </main>
    );
}
