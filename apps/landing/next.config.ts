import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
    poweredByHeader: false,
    reactStrictMode: true,
    async redirects() {
        return [
            {
                source: "/:path+",
                destination: "https://app.projectstairway.net/:path+",
                permanent: false
            }
        ];
    }
};

export default nextConfig;
