import "server-only";
import Stripe from "stripe";
import { stripeEnv } from "@/lib/env";

let client: Stripe | null = null;

/** Server-only Stripe client. The env check rejects anything but sk_test_ keys. */
export function getStripe(): Stripe {
  if (!client) {
    const { STRIPE_SECRET_KEY } = stripeEnv();
    client = new Stripe(STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20_000 });
  }
  return client;
}

export function getPriceIds() {
  const env = stripeEnv();
  return { starter: env.STRIPE_PRICE_STARTER, team: env.STRIPE_PRICE_TEAM };
}
