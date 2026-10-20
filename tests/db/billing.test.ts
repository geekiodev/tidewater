import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleStripeWebhook, type ApplyOutcome, type BillingStore } from "@/lib/billing/webhook";
import { adminQuery, asService, asUser, closePool, createUser, DENIED, type TestUser } from "./helpers";

/**
 * Billing tests:
 *  - signature checks use the real Stripe SDK verifier and Stripe's own
 *    test-signature helper (no network calls; the key is a dummy);
 *  - event application and duplicate handling run against the real
 *    apply_stripe_event() function in a real Postgres database.
 */

const SECRET = "whsec_test_" + randomBytes(16).toString("hex");
const PRICES = { starter: "price_test_starter", team: "price_test_team" };
const stripe = new Stripe("sk_test_dummy_not_a_real_key");

/** Same RPC the app makes, but over pg as service_role instead of supabase-js. */
const pgStore: BillingStore = {
  async applyStripeEvent(u) {
    return asService(async (c) => {
      const r = await c.query<{ outcome: ApplyOutcome }>(
        "select public.apply_stripe_event($1, $2, $3, $4, $5, $6, $7, $8, $9) as outcome",
        [
          u.eventId,
          u.eventType,
          u.eventCreated.toISOString(),
          u.workspaceId,
          u.customerId,
          u.subscriptionId,
          u.status,
          u.plan,
          u.currentPeriodEnd?.toISOString() ?? null,
        ],
      );
      return r.rows[0].outcome;
    });
  },
};

let owner: TestUser;
let ws: string;
let counter = 0;

function evtId() {
  counter += 1;
  return `evt_test${Date.now()}${counter}`;
}

function subscriptionEvent(opts: {
  id?: string;
  type?: string;
  status?: string;
  price?: string;
  created?: number;
  workspaceId?: string;
  customer?: string;
  subscription?: string;
}) {
  return {
    id: opts.id ?? evtId(),
    object: "event",
    type: opts.type ?? "customer.subscription.updated",
    created: opts.created ?? Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: opts.subscription ?? "sub_test1",
        object: "subscription",
        customer: opts.customer ?? "cus_test1",
        status: opts.status ?? "active",
        metadata: { workspace_id: opts.workspaceId ?? ws },
        items: {
          object: "list",
          data: [
            {
              id: "si_test1",
              object: "subscription_item",
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
              price: { id: opts.price ?? PRICES.team, object: "price" },
            },
          ],
        },
      },
    },
  };
}

function sign(payload: string, opts: { secret?: string; timestamp?: number } = {}) {
  return stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp,
  });
}

async function deliver(event: object, opts: { signature?: string | null; body?: string } = {}) {
  const body = opts.body ?? JSON.stringify(event);
  return handleStripeWebhook({
    rawBody: body,
    signature: opts.signature === undefined ? sign(body) : opts.signature,
    webhookSecret: SECRET,
    stripe,
    prices: PRICES,
    store: pgStore,
  });
}

async function billingState() {
  const r = await adminQuery<{ subscription_status: string; plan: string | null; stripe_customer_id: string | null }>(
    "select subscription_status, plan, stripe_customer_id from public.workspaces where id = $1",
    [ws],
  );
  return r.rows[0];
}

async function stripeEventCount(id: string) {
  const r = await adminQuery<{ n: string }>("select count(*)::text as n from private.stripe_events where id = $1", [id]);
  return Number(r.rows[0].n);
}

beforeAll(async () => {
  owner = await createUser({ workspaceName: "Billing Co" });
  ws = owner.workspaceId!;
});

afterAll(async () => {
  await closePool();
});

describe("webhook signature verification", () => {
  it("rejects a request without a signature", async () => {
    const res = await deliver(subscriptionEvent({}), { signature: null });
    expect(res.status).toBe(400);
  });

  it("rejects a signature made with a different secret", async () => {
    const body = JSON.stringify(subscriptionEvent({}));
    const res = await deliver({}, { body, signature: sign(body, { secret: "whsec_attacker" }) });
    expect(res.status).toBe(400);
    expect((await billingState()).subscription_status).toBe("none");
  });

  it("rejects a tampered body", async () => {
    const original = JSON.stringify(subscriptionEvent({ status: "canceled" }));
    const tampered = original.replace('"canceled"', '"active"');
    const res = await deliver({}, { body: tampered, signature: sign(original) });
    expect(res.status).toBe(400);
    expect((await billingState()).subscription_status).toBe("none");
  });

  it("rejects an old (replayed) signature timestamp", async () => {
    const body = JSON.stringify(subscriptionEvent({}));
    const old = Math.floor(Date.now() / 1000) - 60 * 60;
    const res = await deliver({}, { body, signature: sign(body, { timestamp: old }) });
    expect(res.status).toBe(400);
  });

  it("rejects garbage signature headers", async () => {
    const res = await deliver(subscriptionEvent({}), { signature: "t=1,v1=deadbeef" });
    expect(res.status).toBe(400);
  });
});

describe("applying events", () => {
  it("activates the workspace on a valid signed event", async () => {
    const res = await deliver(subscriptionEvent({ status: "active", price: PRICES.team }));
    expect(res).toEqual({ status: 200, body: { received: true, outcome: "applied" } });
    expect(await billingState()).toMatchObject({ subscription_status: "active", plan: "team", stripe_customer_id: "cus_test1" });
  });

  it("processes the same event only once when delivered twice", async () => {
    const id = evtId();
    const event = subscriptionEvent({ id, status: "past_due" });
    const first = await deliver(event);
    expect(first.body.outcome).toBe("applied");
    expect((await billingState()).subscription_status).toBe("past_due");

    // Something else changes state in between...
    await deliver(subscriptionEvent({ status: "active" }));
    expect((await billingState()).subscription_status).toBe("active");

    // ...then Stripe redelivers the first event: it must be a no-op.
    const second = await deliver(event);
    expect(second).toEqual({ status: 200, body: { received: true, outcome: "duplicate" } });
    expect((await billingState()).subscription_status).toBe("active");
    expect(await stripeEventCount(id)).toBe(1);
  });

  it("handles concurrent duplicate deliveries safely", async () => {
    const event = subscriptionEvent({ status: "active" });
    const results = await Promise.all([deliver(event), deliver(event), deliver(event)]);
    const outcomes = results.map((r) => r.body.outcome).sort();
    expect(outcomes).toEqual(["applied", "duplicate", "duplicate"]);
  });

  it("ignores an older event that arrives after a newer one", async () => {
    const now = Math.floor(Date.now() / 1000);
    await deliver(subscriptionEvent({ status: "active", created: now + 10 }));
    const res = await deliver(subscriptionEvent({ status: "canceled", created: now - 100 }));
    expect(res.body.outcome).toBe("stale");
    expect((await billingState()).subscription_status).toBe("active");
  });

  it("rejects an event whose customer doesn't match the workspace", async () => {
    const res = await deliver(
      subscriptionEvent({ customer: "cus_someoneelse", created: Math.floor(Date.now() / 1000) + 20 }),
    );
    expect(res.body.outcome).toBe("customer_mismatch");
    expect((await billingState()).stripe_customer_id).toBe("cus_test1");
  });

  it("an unknown price leaves the workspace without a plan (inactive)", async () => {
    const other = await createUser({ workspaceName: "Unknown Price Co" });
    await deliver(
      subscriptionEvent({ workspaceId: other.workspaceId!, customer: "cus_test2", subscription: "sub_test2", price: "price_not_ours" }),
    );
    const r = await adminQuery("select plan, subscription_status from public.workspaces where id = $1", [other.workspaceId]);
    expect(r.rows[0]).toEqual({ plan: null, subscription_status: "active" });
    await expect(
      asUser(other.id, (c) =>
        c.query("insert into public.clients (workspace_id, name, created_by) values ($1, 'x', $2)", [other.workspaceId, other.id]),
      ),
    ).rejects.toThrow(DENIED);
  });

  it("ignores event types it doesn't handle", async () => {
    const res = await deliver({ ...subscriptionEvent({}), type: "invoice.created" });
    expect(res.body.outcome).toBe("ignored");
  });

  it("throws when the database rejects the update (the route answers 500 so Stripe retries)", async () => {
    // Force a database error with a status the schema doesn't allow.
    const event = subscriptionEvent({ status: "not_a_status", created: Math.floor(Date.now() / 1000) + 30 });
    await expect(deliver(event)).rejects.toThrow();
    // The failed attempt rolled back, so the event id was not recorded.
    expect(await stripeEventCount(event.id)).toBe(0);
  });
});

describe("subscription gating in the database", () => {
  let gated: TestUser;
  let clientId: string;

  beforeAll(async () => {
    gated = await createUser({ workspaceName: "Gated Co" });
    await deliver(
      subscriptionEvent({ workspaceId: gated.workspaceId!, customer: "cus_gated", subscription: "sub_gated", status: "active" }),
    );
    clientId = await asUser(gated.id, async (c) => {
      const r = await c.query<{ id: string }>(
        "insert into public.clients (workspace_id, name, created_by) values ($1, 'Existing', $2) returning id",
        [gated.workspaceId, gated.id],
      );
      return r.rows[0].id;
    });
    await deliver(
      subscriptionEvent({
        type: "customer.subscription.deleted",
        workspaceId: gated.workspaceId!,
        customer: "cus_gated",
        subscription: "sub_gated",
        status: "canceled",
        created: Math.floor(Date.now() / 1000) + 60,
      }),
    );
  });

  it("a cancelled workspace can still read its data", async () => {
    const r = await asUser(gated.id, (c) => c.query("select name from public.clients"));
    expect(r.rows).toEqual([{ name: "Existing" }]);
  });

  it("a cancelled workspace cannot create clients, contacts or notes", async () => {
    const attempts: [string, unknown[]][] = [
      [
        "insert into public.clients (workspace_id, name, created_by) values ($1, 'New', $2)",
        [gated.workspaceId, gated.id],
      ],
      [
        "insert into public.contacts (workspace_id, client_id, full_name) values ($1, $2, 'New')",
        [gated.workspaceId, clientId],
      ],
      [
        "insert into public.notes (workspace_id, client_id, body, author_id) values ($1, $2, 'New', $3)",
        [gated.workspaceId, clientId, gated.id],
      ],
    ];
    for (const [sql, params] of attempts) {
      await expect(asUser(gated.id, (c) => c.query(sql, params)), sql).rejects.toThrow(DENIED);
    }
  });

  it("a cancelled workspace can still edit and delete existing records", async () => {
    const r = await asUser(gated.id, (c) => c.query("update public.clients set name = 'Renamed' where id = $1", [clientId]));
    expect(r.rowCount).toBe(1);
  });
});

describe("AI usage cap", () => {
  it("allows exactly the monthly limit, then refuses; refunds give a slot back", async () => {
    const u = await createUser({ workspaceName: "Quota Co" });
    const reserve = () =>
      asService(async (c) => (await c.query<{ ok: boolean }>("select public.reserve_ai_brief($1, 2) as ok", [u.workspaceId])).rows[0].ok);
    expect([await reserve(), await reserve(), await reserve()]).toEqual([true, true, false]);
    await asService((c) => c.query("select public.settle_ai_brief($1, false, 0, 0)", [u.workspaceId]));
    expect(await reserve()).toBe(true);
  });

  it("a limit of zero refuses everything", async () => {
    const u = await createUser({ workspaceName: "Zero Co" });
    const ok = await asService(
      async (c) => (await c.query<{ ok: boolean }>("select public.reserve_ai_brief($1, 0) as ok", [u.workspaceId])).rows[0].ok,
    );
    expect(ok).toBe(false);
  });
});
