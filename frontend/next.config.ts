import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
    output: "standalone",
    images: {
        // Allow importing local images from public/
        unoptimized: false,
    },
    turbopack: {
        root: path.resolve(__dirname),
    },
};

export default nextConfig;
