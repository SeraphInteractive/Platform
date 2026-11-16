import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
    poweredByHeader: false,
    reactStrictMode: true,
    images: {
        unoptimized: true
    },
    allowedDevOrigins: ["127.0.0.1", "localhost", "127.0.0.1:3005", "localhost:3005"],
    async redirects() {
        return [
            {
                source: "/:path((?!logo\\.jpg|wordmark\\.svg|stairway-title\\.png|title-left\\.png|title-right\\.png|valley-bg\\.mp4|valley-frames|favicon\\.ico|_next|sequence|partners|fonts).+)",
                destination: "https://app.projectstairway.net/:path",
                permanent: false
            }
        ];
    }
};

export default nextConfig;
