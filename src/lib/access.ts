/**
 * Which paths can be reached without signing in. Everything else requires a
 * verified session; this is enforced in src/proxy.ts AND again inside every
 * page, server action and route handler (requireUser / requireWorkspace), so
 * the proxy is not the only line of defence.
 */
const PUBLIC_PAGES = new Set(["/", "/login", "/signup"]);
const PUBLIC_PREFIXES = ["/auth/callback"];
// Public API routes authenticate in other ways (e.g. Stripe signature).
const PUBLIC_API = new Set<string>(["/api/stripe/webhook"]);

export function isPublicPath(pathname: string, opts: { apiOnly?: boolean } = {}): boolean {
  const path = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  if (PUBLIC_API.has(path)) return true;
  if (opts.apiOnly) return false;
  if (PUBLIC_PAGES.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * Only allow same-site relative redirects after login (prevents open
 * redirects via ?next=https://evil.example).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next) || next.length > 512) return fallback;
  return next;
}
