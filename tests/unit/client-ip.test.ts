import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ABUSE-001: per-IP rate limits must use only the header Vercel sets
 * (x-vercel-forwarded-for), never X-Forwarded-For or X-Real-IP, which a
 * client can send.
 */

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { clientIp } = await import("@/lib/rate-limit");

function request(h: Record<string, string>) {
  requestHeaders = new Headers(h);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("ignores a spoofed X-Forwarded-For and X-Real-IP on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    request({
      "x-forwarded-for": "198.51.100.66, 203.0.113.9",
      "x-real-ip": "198.51.100.66",
      "x-vercel-forwarded-for": "203.0.113.9",
    });
    expect(await clientIp()).toBe("203.0.113.9");
  });

  it("returns unknown on Vercel when only spoofable headers are present", async () => {
    vi.stubEnv("VERCEL", "1");
    request({ "x-forwarded-for": "198.51.100.66", "x-real-ip": "198.51.100.66" });
    expect(await clientIp()).toBe("unknown");
  });

  it("gives every spoofed X-Forwarded-For value the same bucket", async () => {
    vi.stubEnv("VERCEL", "1");
    const seen = new Set<string>();
    for (const spoof of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      request({ "x-forwarded-for": spoof, "x-vercel-forwarded-for": "203.0.113.9" });
      seen.add(await clientIp());
    }
    expect([...seen]).toEqual(["203.0.113.9"]);
  });

  it("doesn't trust x-vercel-forwarded-for when not running on Vercel (a client could send it)", async () => {
    vi.stubEnv("VERCEL", "");
    request({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "198.51.100.66" });
    expect(await clientIp()).toBe("unknown");
  });

  it("rejects a value that isn't an IP address", async () => {
    vi.stubEnv("VERCEL", "1");
    request({ "x-vercel-forwarded-for": "not-an-ip" });
    expect(await clientIp()).toBe("unknown");
  });

  it("accepts IPv6", async () => {
    vi.stubEnv("VERCEL", "1");
    request({ "x-vercel-forwarded-for": "2001:db8::1" });
    expect(await clientIp()).toBe("2001:db8::1");
  });
});
