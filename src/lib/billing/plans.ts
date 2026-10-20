/**
 * Plans are defined ONLY here, on the server. The browser sends a plan key
 * ("starter" | "team"); the Stripe price used for checkout comes from server
 * environment variables. Amounts are configured on the Stripe price objects
 * and are never accepted from the browser.
 */

export const PLAN_KEYS = ["starter", "team"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLANS: Record<PlanKey, { label: string; summary: string }> = {
  starter: {
    label: "Starter",
    summary: "For small agencies getting organised.",
  },
  team: {
    label: "Team",
    summary: "For agencies with several people working accounts.",
  },
};

export type PriceIds = { starter: string; team: string };

export function priceIdForPlan(plan: PlanKey, prices: PriceIds): string {
  return prices[plan];
}

/** Reverse lookup for webhook events. Unknown prices map to null. */
export function planForPriceId(priceId: string | null | undefined, prices: PriceIds): PlanKey | null {
  if (!priceId) return null;
  for (const key of PLAN_KEYS) {
    if (prices[key] === priceId) return key;
  }
  return null;
}

export const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function isSubscriptionActive(status: string | null | undefined, plan: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.has(status) && !!plan;
}
