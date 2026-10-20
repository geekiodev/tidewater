import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every screen in Tidewater is rendered
  // per user from their session, and the nonce-based Content Security Policy
  // set in src/proxy.ts needs every page to be dynamically rendered anyway.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
