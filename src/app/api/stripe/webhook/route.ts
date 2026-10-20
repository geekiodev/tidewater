import { NextResponse, type NextRequest } from "next/server";
import { handleStripeWebhook, MAX_WEBHOOK_BYTES } from "@/lib/billing/webhook";
import { supabaseBillingStore } from "@/lib/billing/supabase-store";
import { getPriceIds, getStripe } from "@/lib/billing/stripe";
import { stripeEnv } from "@/lib/env";
import { reportError } from "@/lib/errors/report";

/**
 * Stripe webhook. Public (Stripe has no user session) and exempt from the
 * CSRF origin check; it is authenticated by the Stripe signature instead.
 */
export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ received: false, error: "payload too large" }, { status: 413 });
  }

  try {
    const rawBody = await request.text(); // raw body is required for signature verification
    const result = await handleStripeWebhook({
      rawBody,
      signature: request.headers.get("stripe-signature"),
      webhookSecret: stripeEnv().STRIPE_WEBHOOK_SECRET,
      stripe: getStripe(),
      prices: getPriceIds(),
      store: supabaseBillingStore,
    });
    if (result.body.outcome === "unknown_workspace" || result.body.outcome === "customer_mismatch") {
      reportError(new Error(`Stripe event not applied: ${result.body.outcome}`), { where: "stripe-webhook" });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    reportError(err, { where: "stripe-webhook" });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
