import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ApplyOutcome, BillingStore, StripeEventUpdate } from "./webhook";

const OUTCOMES = new Set<ApplyOutcome>(["applied", "duplicate", "stale", "unknown_workspace", "customer_mismatch"]);

/** Applies webhook updates through the service-role client (no user session exists). */
export const supabaseBillingStore: BillingStore = {
  async applyStripeEvent(u: StripeEventUpdate): Promise<ApplyOutcome> {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("apply_stripe_event", {
      p_event_id: u.eventId,
      p_event_type: u.eventType,
      p_event_created: u.eventCreated.toISOString(),
      p_workspace_id: u.workspaceId,
      p_customer_id: u.customerId,
      p_subscription_id: u.subscriptionId,
      p_status: u.status,
      p_plan: u.plan,
      p_current_period_end: u.currentPeriodEnd ? u.currentPeriodEnd.toISOString() : null,
    });
    if (error) throw error;
    if (!OUTCOMES.has(data as ApplyOutcome)) throw new Error("Unexpected apply_stripe_event result");
    return data as ApplyOutcome;
  },
};
