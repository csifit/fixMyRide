import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Allows a 2 MB logo plus the small multipart/form-data envelope.
      bodySizeLimit: "2150kb",
    },
  },
};

export default nextConfig;
