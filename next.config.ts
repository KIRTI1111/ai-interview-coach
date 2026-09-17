import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse loads pdf.js worker files at runtime. Keeping the package external
  // preserves those files instead of folding only part of them into server chunks.
  serverExternalPackages: ["pdf-parse"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
