/**
 * Cross-site request forgery protection for every state-changing request.
 *
 * Layers:
 *  1. Supabase session cookies are SameSite=Lax, so browsers don't send them
 *     on cross-site POSTs.
 *  2. Next.js Server Actions compare Origin with Host and reject mismatches.
 *  3. This check, run in the proxy for ALL non-GET requests (server actions
 *     and route handlers alike): the request must come from our own origin,
 *     proven by the Origin header or, failing that, Sec-Fetch-Site.
 *     Requests with neither header are rejected.
 *
 * Exempt: the Stripe webhook, which has no browser origin and is
 * authenticated by its signature instead.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_EXEMPT_PATHS = new Set(["/api/stripe/webhook"]);

export function isCsrfSafe(opts: {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  allowedOrigins: string[];
}): boolean {
  const method = opts.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return true;
  if (CSRF_EXEMPT_PATHS.has(opts.pathname)) return true;

  if (opts.origin && opts.origin !== "null") {
    return opts.allowedOrigins.includes(opts.origin);
  }
  // No Origin header (some older browsers on same-origin requests): fall back
  // to Fetch Metadata.
  if (opts.secFetchSite) {
    return opts.secFetchSite === "same-origin";
  }
  return false;
}
