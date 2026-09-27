import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const securityHeaders = [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" }
];

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
    poweredByHeader: false,
    reactStrictMode: true,
    typedRoutes: true,
    images: { unoptimized: true },
    async redirects() {
        return [
            { source: "/docs", destination: "/guidelines", permanent: false },
            { source: "/progress", destination: "/roadmap", permanent: false }
        ];
    },
    async headers() {
        return [{ source: "/:path*", headers: securityHeaders }];
    }
};

export default nextConfig;
