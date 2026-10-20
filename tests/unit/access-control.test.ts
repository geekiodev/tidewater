import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicPath, safeNextPath } from "@/lib/access";

// The proxy asks Supabase who the user is; stub that answer.
let currentUser: { id: string } | null = null;
const getUser = vi.fn(async () => ({ data: { user: currentUser }, error: null }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

const { proxy } = await import("@/proxy");

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "http://localhost:3000"), init);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key-not-real");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  currentUser = null;
  getUser.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public paths", () => {
  it.each(["/", "/login", "/signup", "/auth/callback", "/api/stripe/webhook", "/api/health", "/login/"])("%s is public", (p) => {
    expect(isPublicPath(p)).toBe(true);
  });

  it.each(["/clients", "/clients/123", "/settings/team", "/settings/billing", "/onboarding", "/invite/abc", "/api/clients/1/brief", "/loginx", "/signup/../clients"])(
    "%s requires login",
    (p) => {
      expect(isPublicPath(p)).toBe(false);
    },
  );
});

describe("post-login redirect target", () => {
  it.each([
    ["/clients", "/clients"],
    ["/invite/abc", "/invite/abc"],
    ["https://evil.example", "/home"],
    ["//evil.example", "/home"],
    ["/\\evil.example", "/home"],
    ["javascript:alert(1)", "/home"],
    [undefined, "/home"],
  ])("safeNextPath(%s) -> %s", (input, expected) => {
    expect(safeNextPath(input as string | undefined, "/home")).toBe(expected);
  });
});

describe("proxy: server-side login check", () => {
  it("redirects a signed-out request for a protected page to /login with next", async () => {
    const res = await proxy(req("/clients?q=a"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/clients?q=a");
  });

  it("answers 401 to a signed-out API request", async () => {
    const res = await proxy(req("/api/clients/00000000-0000-0000-0000-000000000000/brief", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }));
    expect(res.status).toBe(401);
  });

  it("lets a signed-out request reach public pages", async () => {
    const res = await proxy(req("/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a signed-in user through to protected pages", async () => {
    currentUser = { id: "11111111-1111-1111-1111-111111111111" };
    const res = await proxy(req("/clients"));
    expect(res.status).toBe(200);
    expect(getUser).toHaveBeenCalled();
  });

  it("treats everything as signed out (fails closed) when Supabase isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    currentUser = { id: "11111111-1111-1111-1111-111111111111" };
    const res = await proxy(req("/clients"));
    expect(res.status).toBe(307);
  });

  it("doesn't look up a session for the Stripe webhook", async () => {
    await proxy(req("/api/stripe/webhook", { method: "POST" }));
    expect(getUser).not.toHaveBeenCalled();
  });
});

describe("proxy: CSRF and headers", () => {
  it("blocks a cross-site POST even for a signed-in user", async () => {
    currentUser = { id: "11111111-1111-1111-1111-111111111111" };
    const res = await proxy(req("/clients", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
  });

  it("blocks a POST with no Origin and no Sec-Fetch-Site", async () => {
    const res = await proxy(req("/login", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("allows a same-origin POST when the browser addressed the app as 127.0.0.1 (Host header, not Next's normalised origin)", async () => {
    vi.stubEnv("APP_URL", "");
    const res = await proxy(
      req("/login", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } }),
    );
    expect(res.status).toBe(200);
  });

  it("does not accept an origin that matches neither the Host header nor APP_URL", async () => {
    const res = await proxy(
      req("/login", { method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:4000" } }),
    );
    expect(res.status).toBe(403);
  });

  it("allows a same-origin POST", async () => {
    const res = await proxy(req("/login", { method: "POST", headers: { origin: "http://localhost:3000" } }));
    expect(res.status).toBe(200);
  });

  it("sets a nonce CSP and security headers, with a fresh nonce per request", async () => {
    const a = await proxy(req("/login"));
    const b = await proxy(req("/login"));
    const cspA = a.headers.get("content-security-policy")!;
    expect(cspA).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(cspA).toContain("frame-ancestors 'none'");
    expect(cspA).not.toContain("unsafe-inline");
    expect(cspA).not.toEqual(b.headers.get("content-security-policy"));
    expect(a.headers.get("x-frame-options")).toBe("DENY");
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
    expect(a.headers.get("strict-transport-security")).toContain("max-age=63072000");
  });

  it("also sets security headers on redirects and errors", async () => {
    const res = await proxy(req("/clients"));
    expect(res.headers.get("content-security-policy")).toBeTruthy();
    expect(res.headers.get("strict-transport-security")).toBeTruthy();
  });
});
