import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the Petworld page moved from /pet to /truman
  async redirects() {
    return [{ source: "/pet", destination: "/truman", permanent: true }];
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
