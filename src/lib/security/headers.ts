/**
 * Security headers. The CSP uses a per-request nonce (set in src/proxy.ts) so
 * only scripts Next.js renders for this response can run; there is no
 * 'unsafe-inline' for scripts in production.
 */

export function buildCsp(nonce: string, isDev: boolean, upgradeInsecure = !isDev): string {
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Dev tooling injects inline styles; production only allows nonce'd styles.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The browser only talks to our own origin; Supabase, Stripe and
    // Anthropic are called from the server.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Stripe Checkout / Billing Portal are reached by redirect after a form post.
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (upgradeInsecure) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Headers applied to every response (static ones also set in next.config.ts). */
export function staticSecurityHeaders(isDev: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
  };
  if (!isDev) {
    // Two years, all subdomains. Browsers ignore HSTS over plain http, so it is
    // only sent outside development.
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
