import type Stripe from "stripe";
import { planForPriceId, type PlanKey, type PriceIds } from "./plans";

/**
 * Stripe webhook handling, kept free of Next.js and Supabase imports so the
 * same code runs in the route handler and in the tests (which use a real
 * Postgres database through a different store implementation).
 */

export type StripeEventUpdate = {
  eventId: string;
  eventType: string;
  eventCreated: Date;
  workspaceId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  /** null = only link customer/subscription ids (checkout completed) */
  status: string | null;
  plan: PlanKey | null;
  currentPeriodEnd: Date | null;
};

export type ApplyOutcome = "applied" | "duplicate" | "stale" | "unknown_workspace" | "customer_mismatch";

export interface BillingStore {
  applyStripeEvent(update: StripeEventUpdate): Promise<ApplyOutcome>;
}

export const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function workspaceIdFrom(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (c && UUID_RE.test(c)) return c;
  }
  return null;
}

/** Map a verified Stripe event to the update we store, or null to ignore it. */
export function eventToUpdate(event: Stripe.Event, prices: PriceIds): StripeEventUpdate | null {
  const base = {
    eventId: event.id,
    eventType: event.type,
    eventCreated: new Date(event.created * 1000),
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return null;
      return {
        ...base,
        workspaceId: workspaceIdFrom(session.metadata?.workspace_id, session.client_reference_id),
        customerId: idOf(session.customer),
        subscriptionId: idOf(session.subscription),
        status: null,
        plan: null,
        currentPeriodEnd: null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const item = sub.items?.data?.[0];
      const periodEnd = item?.current_period_end;
      return {
        ...base,
        workspaceId: workspaceIdFrom(sub.metadata?.workspace_id),
        customerId: idOf(sub.customer),
        subscriptionId: sub.id,
        status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
        plan: planForPriceId(item?.price?.id, prices),
        currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
      };
    }
    default:
      return null;
  }
}

export type WebhookResult = { status: number; body: { received: boolean; outcome?: string; error?: string } };

export const MAX_WEBHOOK_BYTES = 512 * 1024;

/**
 * Verify the signature, then apply the event. Every event must carry a valid
 * signature for the configured secret; unverified payloads are never parsed.
 * Duplicate deliveries are detected by event id inside the database
 * transaction, so retries are harmless.
 */
export async function handleStripeWebhook(opts: {
  rawBody: string;
  signature: string | null;
  webhookSecret: string;
  stripe: Pick<Stripe, "webhooks">;
  prices: PriceIds;
  store: BillingStore;
}): Promise<WebhookResult> {
  const { rawBody, signature, webhookSecret, stripe, prices, store } = opts;

  if (!signature) return { status: 400, body: { received: false, error: "missing signature" } };
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return { status: 413, body: { received: false, error: "payload too large" } };
  }

  let event: Stripe.Event;
  try {
    // Default tolerance: 300 seconds, which also limits replay of old payloads.
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return { status: 400, body: { received: false, error: "invalid signature" } };
  }

  const update = eventToUpdate(event, prices);
  if (!update) return { status: 200, body: { received: true, outcome: "ignored" } };

  // A store failure throws: the route returns 500 and Stripe retries. The
  // transaction rolled back, so the retry is processed normally.
  const outcome = await store.applyStripeEvent(update);
  return { status: 200, body: { received: true, outcome } };
}
