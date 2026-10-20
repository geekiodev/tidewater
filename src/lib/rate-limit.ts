import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportError } from "@/lib/errors/report";

export type RateLimitRule = { name: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  loginPerIp: { name: "login:ip", limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { name: "login:email", limit: 8, windowSeconds: 15 * 60 },
  signupPerIp: { name: "signup:ip", limit: 5, windowSeconds: 60 * 60 },
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
 * Best-effort client IP. Assumes the app runs behind a proxy/load balancer
 * that sets X-Forwarded-For (first entry is the client). Without a trusted
 * proxy this header can be spoofed, which is why logins are also limited per
 * email address.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}
