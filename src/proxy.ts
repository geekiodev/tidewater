import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isApiPath, isPublicPath } from "@/lib/access";
import { isCsrfSafe } from "@/lib/security/csrf";
import { buildCsp, generateNonce, staticSecurityHeaders } from "@/lib/security/headers";

/**
 * Runs before every matched request:
 *  1. rejects cross-site state-changing requests (CSRF),
 *  2. sets a per-request CSP nonce and the security headers,
 *  3. refreshes the Supabase session cookie,
 *  4. blocks signed-out requests to anything that isn't public.
 * Pages, actions and route handlers re-check the session themselves too.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";

  const allowedOrigins = [request.nextUrl.origin];
  if (process.env.APP_URL) {
    try {
      allowedOrigins.push(new URL(process.env.APP_URL).origin);
    } catch {
      // ignore a malformed APP_URL here; env validation reports it elsewhere
    }
  }

  const nonce = generateNonce();
  // Only upgrade sub-requests when the app is served over https (a local
  // `npm start` on http://localhost would otherwise break).
  const csp = buildCsp(nonce, isDev, !isDev && (process.env.APP_URL ?? "").startsWith("https://"));
  const withSecurityHeaders = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    for (const [k, v] of Object.entries(staticSecurityHeaders(isDev))) res.headers.set(k, v);
    return res;
  };

  if (
    !isCsrfSafe({
      method: request.method,
      pathname,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      allowedOrigins,
    })
  ) {
    return withSecurityHeaders(NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 }));
  }

  // Next.js reads the nonce from the request's CSP header and applies it to
  // the scripts it renders.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let userId: string | null = null;
  if (url && anonKey && !isPublicPath(pathname, { apiOnly: true })) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          // keep the nonce/CSP request headers when re-creating the response
          requestHeaders.set("cookie", request.cookies.toString());
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    });
    // getUser() verifies the token with Supabase Auth; don't trust cookie contents.
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }

  if (!userId && !isPublicPath(pathname)) {
    if (isApiPath(pathname)) {
      return withSecurityHeaders(NextResponse.json({ error: "Not signed in" }, { status: 401 }));
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    // Everything except Next.js static assets and the favicon (those get the
    // static security headers from next.config.ts).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
