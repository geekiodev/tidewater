import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/errors/report";

export type RateLimitRule = { name: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIp: { name: "login:ip", limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { name: "login:email", limit: 8, windowSeconds: 15 * 60 },
  signupPerIp: { name: "signup:ip", limit: 5, windowSeconds: 60 * 60 },
  briefPerUser: { name: "brief:user", limit: 5, windowSeconds: 60 },
  briefPerWorkspace: { name: "brief:workspace", limit: 60, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/** Identifiers are hashed so the rate-limit table never stores emails or IPs. */
export function bucketKey(rule: RateLimitRule, identifier: string): string {
  const digest = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
  return `${rule.name}:${digest}`;
}

/**
 * Records a hit and returns whether it is allowed. Backed by Postgres so the
 * limit holds across server instances. Fails CLOSED: if the limiter can't be
 * reached, the attempt is refused.
 */
export async function hitRateLimit(rule: RateLimitRule, identifier: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: bucketKey(rule, identifier),
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    reportError(err, { where: "rate-limit", rule: rule.name });
    return false;
  }
}

/**
 * The client IP for per-IP rate limits, read only from a header the hosting
 * platform sets and the client can't override (ABUSE-001).
 *
 * On Vercel (`VERCEL=1`) that is `x-vercel-forwarded-for`. Vercel documents it
 * as identical to `x-forwarded-for`, which Vercel overwrites "to prevent IP
 * spoofing", and, unlike `x-forwarded-for`, it stays correct if another proxy
 * is put in front of Vercel (https://vercel.com/docs/headers/request-headers).
 *
 * `X-Forwarded-For` and `X-Real-IP` are never read: a client can send them.
 * Off Vercel there is no trusted header, so every request gets the same
 * "unknown" bucket; per-email login limits still apply.
 */
export async function clientIp(): Promise<string> {
  if (process.env.VERCEL !== "1") return "unknown";
  const h = await headers();
  const ip = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIP(ip) ? ip : "unknown";
}
