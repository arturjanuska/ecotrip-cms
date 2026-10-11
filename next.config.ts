import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CMS pages are dynamic (each checks the admin role), and Next keeps no
    // client copy of dynamic pages by default: every sidebar click waited for
    // the server. Reuse a visited page for 5 minutes; the data on it is
    // refreshed by the page itself, and every write still checks the role.
    staleTimes: { dynamic: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
