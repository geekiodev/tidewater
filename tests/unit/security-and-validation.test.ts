import { describe, expect, it } from "vitest";
import { isCsrfSafe } from "@/lib/security/csrf";
import { buildCsp } from "@/lib/security/headers";
import { clientInputSchema, contactInputSchema, escapeLike, LIMITS, noteInputSchema, parseListQuery } from "@/lib/validation/crm";
import { buildErrorEvent, scrubContext, scrubString } from "@/lib/errors/report";
import { isSubscriptionActive, planForPriceId } from "@/lib/billing/plans";

const allowed = ["http://localhost:3000"];

describe("CSRF origin check", () => {
  const base = { pathname: "/clients", secFetchSite: null, allowedOrigins: allowed };
  it("allows safe methods", () => {
    expect(isCsrfSafe({ ...base, method: "GET", origin: "https://evil.example" })).toBe(true);
  });
  it("allows same-origin POST", () => {
    expect(isCsrfSafe({ ...base, method: "POST", origin: "http://localhost:3000" })).toBe(true);
  });
  it("blocks cross-origin POST, PUT, DELETE", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(isCsrfSafe({ ...base, method, origin: "https://evil.example" })).toBe(false);
    }
  });
  it("blocks the opaque 'null' origin", () => {
    expect(isCsrfSafe({ ...base, method: "POST", origin: "null" })).toBe(false);
  });
  it("falls back to Sec-Fetch-Site when Origin is missing", () => {
    expect(isCsrfSafe({ ...base, method: "POST", origin: null, secFetchSite: "same-origin" })).toBe(true);
    expect(isCsrfSafe({ ...base, method: "POST", origin: null, secFetchSite: "cross-site" })).toBe(false);
    expect(isCsrfSafe({ ...base, method: "POST", origin: null, secFetchSite: null })).toBe(false);
  });
  it("exempts only the Stripe webhook", () => {
    expect(isCsrfSafe({ ...base, pathname: "/api/stripe/webhook", method: "POST", origin: null })).toBe(true);
    expect(isCsrfSafe({ ...base, pathname: "/api/stripe/webhook2", method: "POST", origin: null })).toBe(false);
  });
});

describe("Content Security Policy", () => {
  it("production policy has no unsafe-inline or unsafe-eval", () => {
    const csp = buildCsp("abc", false);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("'nonce-abc'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("connect-src 'self'");
  });
  it("adds upgrade-insecure-requests only when asked", () => {
    expect(buildCsp("a", false, true)).toContain("upgrade-insecure-requests");
    expect(buildCsp("a", false, false)).not.toContain("upgrade-insecure-requests");
  });
});

describe("input schemas cap sizes", () => {
  it("rejects oversized client names and non-http websites", () => {
    expect(clientInputSchema.safeParse({ name: "x".repeat(LIMITS.clientName + 1) }).success).toBe(false);
    expect(clientInputSchema.safeParse({ name: "Acme", website: "javascript:alert(1)" }).success).toBe(false);
    expect(clientInputSchema.safeParse({ name: "Acme", website: "https://acme.example" }).success).toBe(true);
  });
  it("trims and nulls empty optional contact fields", () => {
    const r = contactInputSchema.parse({ fullName: "  Jo  ", email: "", phone: "", jobTitle: "" });
    expect(r).toEqual({ fullName: "Jo", email: null, phone: null, jobTitle: null });
  });
  it("validates contact email and phone", () => {
    expect(contactInputSchema.safeParse({ fullName: "Jo", email: "nope" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ fullName: "Jo", phone: "<script>" }).success).toBe(false);
    expect(contactInputSchema.safeParse({ fullName: "Jo", phone: "+1 (555) 010-0000" }).success).toBe(true);
  });
  it("caps note length", () => {
    expect(noteInputSchema.safeParse({ body: "x".repeat(LIMITS.noteBody) }).success).toBe(true);
    expect(noteInputSchema.safeParse({ body: "x".repeat(LIMITS.noteBody + 1) }).success).toBe(false);
    expect(noteInputSchema.safeParse({ body: "   " }).success).toBe(false);
  });
  it("caps list page size and page number", () => {
    expect(parseListQuery({ pageSize: "10000", page: "99999999" })).toMatchObject({
      pageSize: LIMITS.defaultPageSize,
      page: 1,
    });
    expect(parseListQuery({ pageSize: "50", page: "2" })).toMatchObject({ pageSize: 50, page: 2 });
    expect(parseListQuery({ pageSize: "51" }).pageSize).toBe(LIMITS.defaultPageSize);
    expect(parseListQuery({ q: "x".repeat(500) }).q).toBe("");
  });
  it("escapes LIKE wildcards in search", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("error reports strip personal data", () => {
  it("removes emails, phone numbers and quoted values from messages", () => {
    const s = scrubString('Key (email)=(jane@acme.example) "Jane Smith" call +1 (555) 123-4567');
    expect(s).not.toContain("jane@acme.example");
    expect(s).not.toContain("Jane Smith");
    expect(s).not.toContain("555");
  });
  it("keeps UUIDs for debugging", () => {
    const id = "3f2b6a1e-1234-4abc-9def-0123456789ab";
    expect(scrubString(`client ${id} failed`)).toContain(id);
  });
  it("redacts personal-data keys and doesn't serialise objects", () => {
    expect(
      scrubContext({ where: "x", email: "a@b.example", fullName: "Jo", body: "secret", nested: { email: "a@b.c" }, count: 2 }),
    ).toEqual({ where: "x", email: "[redacted]", fullName: "[redacted]", body: "[redacted]", nested: "[object]", count: 2 });
  });
  it("drops the message line from stacks and never includes cause", () => {
    const err = new Error("failed for jane@acme.example", { cause: { note: "private" } });
    const ev = buildErrorEvent(err, { where: "t" });
    expect(JSON.stringify(ev)).not.toContain("jane@acme.example");
    expect(JSON.stringify(ev)).not.toContain("private");
    expect(ev.stack?.split("\n")[0]?.trim().startsWith("at ")).toBe(true);
  });
});

describe("plans", () => {
  const prices = { starter: "price_s", team: "price_t" };
  it("maps only known prices to plans", () => {
    expect(planForPriceId("price_s", prices)).toBe("starter");
    expect(planForPriceId("price_t", prices)).toBe("team");
    expect(planForPriceId("price_other", prices)).toBeNull();
    expect(planForPriceId(undefined, prices)).toBeNull();
  });
  it("treats only active/trialing with a plan as active", () => {
    expect(isSubscriptionActive("active", "team")).toBe(true);
    expect(isSubscriptionActive("trialing", "starter")).toBe(true);
    expect(isSubscriptionActive("past_due", "team")).toBe(false);
    expect(isSubscriptionActive("active", null)).toBe(false);
  });
});
