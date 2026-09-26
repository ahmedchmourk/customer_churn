import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker runner image.
  output: "standalone",
  // The report is fully client-rendered; hide the dev overlay badge in screenshots.
  devIndicators: false,
};

export default nextConfig;
