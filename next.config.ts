import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/headers";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every screen in Tidewater is rendered
  // per user from their session, and the nonce-based Content Security Policy
  // set in src/proxy.ts needs every page to be dynamically rendered anyway.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // Baseline headers for every response, including static assets the proxy
  // doesn't run on. The CSP (with its per-request nonce) is set in the proxy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(staticSecurityHeaders(isDev)).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
