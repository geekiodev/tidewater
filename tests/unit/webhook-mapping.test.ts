import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { eventToUpdate } from "@/lib/billing/webhook";

const prices = { starter: "price_s", team: "price_t" };
const WS = "3f2b6a1e-1234-4abc-9def-0123456789ab";

function ev(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: "evt_1", object: "event", type, created: 1_700_000_000, data: { object } } as unknown as Stripe.Event;
}

describe("eventToUpdate", () => {
  it("maps a subscription update using the server-side price table", () => {
    const u = eventToUpdate(
      ev("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { workspace_id: WS },
        items: { data: [{ current_period_end: 1_702_000_000, price: { id: "price_s" } }] },
      }),
      prices,
    );
    expect(u).toMatchObject({ workspaceId: WS, status: "active", plan: "starter", subscriptionId: "sub_1", customerId: "cus_1" });
    expect(u?.currentPeriodEnd?.getTime()).toBe(1_702_000_000_000);
  });

  it("marks deleted subscriptions as canceled", () => {
    const u = eventToUpdate(
      ev("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "active", metadata: {}, items: { data: [] } }),
      prices,
    );
    expect(u?.status).toBe("canceled");
  });

  it("ignores a workspace_id that isn't a UUID", () => {
    const u = eventToUpdate(
      ev("customer.subscription.updated", {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        metadata: { workspace_id: "'; drop table workspaces; --" },
        items: { data: [] },
      }),
      prices,
    );
    expect(u?.workspaceId).toBeNull();
  });

  it("links ids only on checkout completion, and ignores non-subscription checkouts", () => {
    expect(
      eventToUpdate(
        ev("checkout.session.completed", { mode: "subscription", customer: "cus_1", subscription: "sub_1", client_reference_id: WS, metadata: {} }),
        prices,
      ),
    ).toMatchObject({ workspaceId: WS, status: null, customerId: "cus_1", subscriptionId: "sub_1" });
    expect(eventToUpdate(ev("checkout.session.completed", { mode: "payment" }), prices)).toBeNull();
  });

  it("ignores unrelated event types", () => {
    expect(eventToUpdate(ev("invoice.paid", {}), prices)).toBeNull();
  });
});
