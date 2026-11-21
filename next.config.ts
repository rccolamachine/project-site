import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the Petworld page lives at /petworld (it was /pet, then briefly /truman)
  async redirects() {
    return [
      { source: "/pet", destination: "/petworld", permanent: true },
      { source: "/truman", destination: "/petworld", permanent: true },
    ];
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
