import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the pipets page lives at /pipets (it was /petworld, /pet, then briefly /truman)
  async redirects() {
    return [
      { source: "/pet", destination: "/pipets", permanent: true },
      { source: "/petworld", destination: "/pipets", permanent: true },
      { source: "/truman", destination: "/pipets", permanent: true },
    ];
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
