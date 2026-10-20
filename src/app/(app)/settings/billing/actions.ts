"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthorizationError, requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPriceIds, getStripe } from "@/lib/billing/stripe";
import { PLAN_KEYS, priceIdForPlan } from "@/lib/billing/plans";
import { appEnv } from "@/lib/env";
import type { FormState } from "@/lib/forms";
import { reportError } from "@/lib/errors/report";

// The only thing accepted from the browser is the plan key.
const checkoutSchema = z.object({ plan: z.enum(PLAN_KEYS) });

async function ownerContext() {
  try {
    return await requireOwner();
  } catch (e) {
    if (e instanceof AuthorizationError) return null;
    throw e;
  }
}

export async function startCheckoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Only the workspace owner can manage billing." };
  if (ctx.active) return { error: "This workspace already has an active subscription. Use “Manage billing”." };

  const parsed = checkoutSchema.safeParse({ plan: formData.get("plan") });
  if (!parsed.success) return { error: "Choose a plan." };

  // Stripe customer id is read from the database for this workspace, never from the form.
  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, stripe_customer_id")
    .eq("id", ctx.workspace.id)
    .single();
  if (!ws) return { error: "Workspace not found." };

  const { APP_URL } = appEnv();
  let url: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdForPlan(parsed.data.plan, getPriceIds()), quantity: 1 }],
      ...(ws.stripe_customer_id
        ? { customer: ws.stripe_customer_id }
        : { customer_email: ctx.user.email ?? undefined }),
      client_reference_id: ws.id,
      metadata: { workspace_id: ws.id },
      subscription_data: { metadata: { workspace_id: ws.id } },
      allow_promotion_codes: false,
      success_url: new URL("/settings/billing?checkout=success", APP_URL).toString(),
      cancel_url: new URL("/settings/billing?checkout=cancelled", APP_URL).toString(),
    });
    url = session.url;
  } catch (err) {
    reportError(err, { where: "stripe-checkout" });
    return { error: "Couldn't start checkout. Please try again." };
  }
  if (!url) return { error: "Couldn't start checkout. Please try again." };
  redirect(url);
}

export async function openBillingPortalAction(): Promise<FormState> {
  const ctx = await ownerContext();
  if (!ctx) return { error: "Only the workspace owner can manage billing." };

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", ctx.workspace.id)
    .single();
  if (!ws?.stripe_customer_id) return { error: "No billing account yet. Subscribe to a plan first." };

  let url: string;
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: ws.stripe_customer_id,
      return_url: new URL("/settings/billing", appEnv().APP_URL).toString(),
    });
    url = portal.url;
  } catch (err) {
    reportError(err, { where: "stripe-portal" });
    return { error: "Couldn't open the billing portal. Please try again." };
  }
  redirect(url);
}
