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
                // anything that isn't a static file or a next internal goes to the studio app
                source: "/:path((?!_next/)(?!.*\\.[A-Za-z0-9]+$).+)",
                destination: "https://app.projectstairway.net/:path",
                permanent: false
            }
        ];
    }
};

export default nextConfig;
