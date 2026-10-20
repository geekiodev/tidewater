import { requireWorkspace } from "@/lib/auth";
import { PLAN_KEYS, PLANS } from "@/lib/billing/plans";
import { CheckoutButton, PortalButton } from "./billing-forms";

const STATUS_LABELS: Record<string, string> = {
  none: "No subscription",
  incomplete: "Payment incomplete",
  incomplete_expired: "Payment expired",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  paused: "Paused",
};

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const ctx = await requireWorkspace();
  const { checkout } = await searchParams;
  const isOwner = ctx.role === "owner";
  const ws = ctx.workspace;

  return (
    <main>
      <h1>Billing</h1>

      {checkout === "success" && !ctx.active ? (
        <p className="banner">
          Thanks! Your payment is being confirmed. This page will show your plan as soon as Stripe notifies us,
          usually within a few seconds. Refresh to check.
        </p>
      ) : null}
      {checkout === "cancelled" ? <p className="banner">Checkout was cancelled. You haven&apos;t been charged.</p> : null}

      <section className="card stack">
        <h2>Current plan</h2>
        <p>
          <strong>{ws.plan ? PLANS[ws.plan].label : "None"}</strong> ·{" "}
          {STATUS_LABELS[ws.subscriptionStatus] ?? ws.subscriptionStatus}
          {ws.currentPeriodEnd && ctx.active
            ? ` · renews ${new Date(ws.currentPeriodEnd).toLocaleDateString("en-US")}`
            : ""}
        </p>
        {!ctx.active ? (
          <p className="muted">
            Without an active subscription you can still view your clients, contacts and notes, but you can&apos;t
            add new ones or use the account brief.
          </p>
        ) : null}
        {isOwner && ws.hasStripeCustomer ? <PortalButton /> : null}
      </section>

      {isOwner && !ctx.active ? (
        <section className="card stack">
          <h2>Choose a plan</h2>
          <p className="small muted">
            Payment is handled on Stripe&apos;s secure checkout page. Card details never reach Tidewater. The
            monthly price is shown at checkout.
          </p>
          <div className="row">
            {PLAN_KEYS.map((key) => (
              <div key={key} className="card stack grow">
                <h3>{PLANS[key].label}</h3>
                <p className="small">{PLANS[key].summary}</p>
                <CheckoutButton plan={key} label={PLANS[key].label} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!isOwner ? <p className="muted">Only the workspace owner can change the subscription.</p> : null}
    </main>
  );
}
